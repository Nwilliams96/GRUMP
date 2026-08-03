# GRUMP Website

Standalone website for the Global rRNA Universal Metabarcoding of Plankton
(GRUMP) explorer and R workshop.

The browser-ready explorer indexes are included. They support layered sample
filters, all GRUMP and standard taxonomic levels, and exact lookup by ASV hash
or ASV sequence. Distribution data are divided into small files and loaded only
when selected, keeping the initial page lightweight.

ASVs whose `Domain` is recorded as `Unassigned` are excluded from every browser
index. Relative abundances retain the published source-table denominator.

Large raw source CSV files are intentionally excluded from the public
repository. To rebuild the indexes after updating the local GRUMP 1.3.5 long
table, run `scripts/build-explorer-data.py` from the website directory.
