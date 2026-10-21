"""Checks that an uploaded photo shows a real human face.

Uses the Haar cascades bundled with opencv-python-headless (4.x). They are basic;
swap the body of `check_face` for mediapipe or Cloud Vision if accuracy matters more.
"""
import cv2
import numpy as np
from django.core.exceptions import ValidationError

NO_FACE = "We couldn't find a clear human face. Use a well-lit photo of yourself facing the camera."
NO_SIDE_FACE = "We couldn't find a clear side profile of a face. Turn your head sideways and retry."
MANY_FACES = 'Only you should be in this photo.'

DETECT_SIDE = 800  # downscale before detecting; faster and just as accurate for headshots

_cascades = {}


def _detect(gray, cascade_name, min_size):
    if cascade_name not in _cascades:
        _cascades[cascade_name] = cv2.CascadeClassifier(cv2.data.haarcascades + cascade_name)
    faces = _cascades[cascade_name].detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(min_size, min_size))
    return list(faces)


def check_face(image, kind):
    """`image` is a PIL image; `kind` is profile, center, left, right or full_length."""
    image = image.convert('RGB')
    image.thumbnail((DETECT_SIDE, DETECT_SIDE))
    gray = cv2.equalizeHist(cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2GRAY))
    width = gray.shape[1]

    if kind in ('left', 'right'):
        side_faces = _detect(gray, 'haarcascade_profileface.xml', 30)
        side_faces += _detect(cv2.flip(gray, 1), 'haarcascade_profileface.xml', 30)
        # a three-quarter turn often reads as frontal, so accept that too
        if not side_faces and not _detect(gray, 'haarcascade_frontalface_default.xml', 30):
            raise ValidationError(NO_SIDE_FACE)
        return

    if kind == 'full_length':
        if not _detect(gray, 'haarcascade_frontalface_default.xml', 20):
            raise ValidationError(NO_FACE)
        return

    faces = _detect(gray, 'haarcascade_frontalface_default.xml', max(30, width // 10))
    if not faces:
        raise ValidationError(NO_FACE)
    areas = sorted((w * h for _, _, w, h in faces), reverse=True)
    if len(areas) > 1 and areas[1] >= areas[0] / 2:
        raise ValidationError(MANY_FACES)
