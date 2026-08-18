# Bundled fonts

Bundled so ffmpeg/libass always has the *right* font to draw with, regardless
of what the Cloud Functions runtime image ships. Two reasons this matters:

1. If libass finds no usable font it exits 0 and silently renders the text as
   nothing — the burned-in captions come out blank with no error anywhere.
2. If it finds *a* font but not the one the editor previewed with, the post
   comes back in a typeface the user never picked.

The families here mirror the editor's font list — the `<link>` in
`public/index.html`, `ensureFontsLoaded()` in `src/services/overlayRenderer.js`,
and `BUNDLED_FONTS` in `functions/src/index.ts`. Add a font to the editor and
you must drop its .ttf here too, or the burn silently falls back.

Static .ttf files, pulled from the Google Fonts CSS API (`fonts.gstatic.com`):

| File | Family | Licence |
| --- | --- | --- |
| LiberationSans-Regular/Bold | Liberation Sans (metric-compatible Arial fallback) | OFL 1.1 |
| BebasNeue-Regular | Bebas Neue | OFL 1.1 |
| DMSans-Regular/Bold | DM Sans | OFL 1.1 |
| Anton-Regular | Anton | OFL 1.1 |
| ArchivoBlack-Regular | Archivo Black | OFL 1.1 |
| Pacifico-Regular | Pacifico | OFL 1.1 |
| CourierPrime-Regular/Bold | Courier Prime | OFL 1.1 |
| Caveat-Bold | Caveat | OFL 1.1 |

Only families with a real bold face (`bold: true` in `BUNDLED_FONTS`) may be
asked for one — display faces like Bebas Neue, Anton and Archivo Black have a
single weight, and letting libass synthesise a bold smears the glyphs.

Liberation Sans: https://github.com/liberationfonts/liberation-fonts
Everything else: https://github.com/google/fonts
