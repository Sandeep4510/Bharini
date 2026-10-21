"""Validation for uploaded photos, videos and audio. Never trust the client's type or name."""
import os
import tempfile
from io import BytesIO
from pathlib import Path

import cv2
import mutagen
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

from .face import check_face
from .slots import MB

IMAGE_MAX_BYTES = 8 * MB
IMAGE_MAX_SIDE = 2000
IMAGE_FORMATS = {'JPEG', 'PNG', 'WEBP'}
VIDEO_EXTS = {'.mp4', '.mov', '.webm'}
AUDIO_EXTS = {'.mp3', '.m4a', '.wav', '.ogg', '.flac'}
DURATION_GRACE_SECONDS = 0.5


def process_photo(upload, face_kind):
    """Validate, face-check and re-encode a photo. Re-encoding drops EXIF (e.g. GPS location)."""
    if upload.size > IMAGE_MAX_BYTES:
        raise ValidationError('Photo is too large (max 8 MB).')
    try:
        upload.seek(0)
        image = Image.open(upload)
        if image.format not in IMAGE_FORMATS:
            raise ValidationError('Upload a JPG, PNG or WebP photo.')
        image.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise ValidationError('This file is not a valid photo.') from exc

    image = ImageOps.exif_transpose(image).convert('RGB')
    image.thumbnail((IMAGE_MAX_SIDE, IMAGE_MAX_SIDE))
    check_face(image.copy(), face_kind)

    output = BytesIO()
    image.save(output, format='JPEG', quality=88, optimize=True)
    return ContentFile(output.getvalue(), name='photo.jpg')


def _with_local_path(upload, suffix, read):
    """OpenCV and mutagen want a real file path; small uploads only live in memory."""
    if hasattr(upload, 'temporary_file_path'):
        return read(upload.temporary_file_path())
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, 'wb') as handle:
            for chunk in upload.chunks():
                handle.write(chunk)
        return read(path)
    finally:
        os.remove(path)


def _video_duration(path):
    capture = cv2.VideoCapture(path)
    try:
        if not capture.isOpened() or not capture.read()[0]:
            return None
        fps = capture.get(cv2.CAP_PROP_FPS)
        frames = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    finally:
        capture.release()
    # mp4/mov containers store an exact length; fall back to frames / fps (e.g. webm)
    try:
        container = mutagen.File(path)
    except mutagen.MutagenError:
        container = None
    if container is not None and container.info.length:
        return container.info.length
    if fps > 0 and frames > 0:
        return frames / fps
    return None


def _audio_duration(path):
    try:
        audio = mutagen.File(path)
    except mutagen.MutagenError:
        return None
    if audio is None or not audio.info.length:
        return None
    return audio.info.length


def _format_seconds(seconds):
    return f'{seconds} seconds' if seconds < 60 else f'{seconds // 60} min'


def validate_media(upload, slot):
    """Check type, size and duration against the slot. Returns the duration in seconds."""
    suffix = Path(upload.name).suffix.lower()
    allowed = VIDEO_EXTS if slot['kind'] == 'video' else AUDIO_EXTS
    if suffix not in allowed:
        raise ValidationError(f'Upload one of: {", ".join(sorted(allowed))}.')
    if upload.size > slot['max_mb'] * MB:
        raise ValidationError(f'File is too large (max {slot["max_mb"]} MB).')

    read = _video_duration if slot['kind'] == 'video' else _audio_duration
    duration = _with_local_path(upload, suffix, read)
    if duration is None:
        raise ValidationError(f"We couldn't read this {slot['kind']} file. Try exporting it again.")
    if duration > slot['max_seconds'] + DURATION_GRACE_SECONDS:
        raise ValidationError(
            f'This clip is {duration:.1f} seconds long; the limit is {_format_seconds(slot["max_seconds"])}.'
        )
    return round(duration, 2)
