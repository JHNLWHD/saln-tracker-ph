# Read-only develop visual preview

This file is an exact copy of the public regression baseline in `tests/fixtures/legacy-public-2026-10-18.json`. It contains 49 profiles, 129 SALN entries and 629 amounts from the saved public data dated 18 October 2026. It contains no raw SDK fields, private submissions or credentials. See the original fixture README for provenance and limitations.

Only the explicit read-only preview mode serves this data. The server returns the public profiles through the existing Home and profile loaders. This directory is not a static public download. The preview is not a live database or a review of the original PDFs. Source Tip submissions, analytics and reviewed-only UI views are disabled.

This change belongs only to the preview copy on `develop`. It does not approve, merge or modify the original stacked PRs. Before later integration, restore the original develop tree with a separately authorized normal commit; preserve the preview history and then integrate the reviewed PRs through the agreed workflow.
