# Test resumes

Small, bounded test set downloaded from the public [resumes.fyi Explore catalogue](https://resumes.fyi/explore) on 2026-07-18.

All four source pages were visible without signing in and were explicitly tagged:

- Role: Software Engineer
- Level: Intern

The site serves these resumes as raster images rather than PDFs. Original encodings are preserved (`.png` or `.webp`). See `manifest.csv` for source pages, original asset URLs, dimensions, and SHA-256 checksums.

The unauthenticated catalogue hides the rest of the matching collection behind an account gate, so this folder contains only the four matching resumes exposed in the public result set. Treat the files as test data containing third-party personal information; do not publish or redistribute them without confirming permission and licensing.

The raster files stay local and are ignored by Git because this repository is public. The manifest is committed for provenance and reproducibility; the prototype viewer embeds only the already-redacted public samples from their original asset URLs.
