"""Media slots each discipline gets. The API serves this, so clients never hardcode it."""

MB = 1024 * 1024

EMOTIONS = ('love', 'laughter', 'sorrow', 'anger', 'courage', 'fear', 'disgust', 'wonder', 'peace')
SHOWREEL_LINK_LIMIT = 5


def _numbered(prefix, label, count, kind, max_seconds, max_mb):
    return [
        {'key': f'{prefix}_{n}', 'label': f'{label} {n}', 'kind': kind, 'max_seconds': max_seconds, 'max_mb': max_mb}
        for n in range(1, count + 1)
    ]


_PERFORMANCE = _numbered('video', 'Video', 5, 'video', 60, 100) + _numbered('audio', 'Audio', 5, 'audio', 180, 40)

SLOTS = {
    'actor': [
        {'key': emotion, 'label': emotion.title(), 'kind': 'video', 'max_seconds': 10, 'max_mb': 30}
        for emotion in EMOTIONS
    ],
    'singer': _PERFORMANCE,
    'musician': _PERFORMANCE,
    'choreographer': _numbered('video', 'Video', 5, 'video', 120, 200),
    'director': _numbered('reel', 'Reel', 3, 'video', 120, 200),
    # images have no length; max_seconds stays 0
    'cinematographer': _numbered('image', 'Image', 5, 'image', 0, 8) + _numbered('video', 'Video', 5, 'video', 30, 60),
}


def get_slot(discipline, key):
    return next((slot for slot in SLOTS.get(discipline, []) if slot['key'] == key), None)
