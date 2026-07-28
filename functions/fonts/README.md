# Bundled fonts

Liberation Sans (Regular + Bold), licensed under the SIL Open Font License 1.1.
https://github.com/liberationfonts/liberation-fonts

Bundled so ffmpeg/libass always has a font to draw subtitles with, regardless
of what the Cloud Functions runtime image ships. If libass finds no usable
font it exits 0 and silently renders the text as nothing — the burned-in
captions come out blank with no error anywhere.
