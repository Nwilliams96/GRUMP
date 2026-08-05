# GRUMP Website

Standalone website for the Global rRNA Universal Metabarcoding of Plankton
(GRUMP) explorer and R workshop.

- [Open the GRUMP Explorer](https://www.nathanlrwilliams.com/GRUMP/)
- [Open the GRUMP Workshop](https://www.nathanlrwilliams.com/GRUMP/workshop/)
- [Download GRUMP data from Zenodo](https://zenodo.org/records/15446784)
- [Read the GRUMP data descriptor](https://doi.org/10.1038/s41597-025-05423-9)

The browser-ready explorer indexes are included. They support layered sample
filters, all GRUMP and standard taxonomic levels, and exact lookup by ASV hash
or ASV sequence. Distribution data are divided into small files and loaded only
when selected, keeping the initial page lightweight.

ASVs whose `Domain` is recorded as `Unassigned` are excluded from every browser
index. Relative abundances retain the published source-table denominator.

Large raw source CSV files are intentionally excluded from the public
repository. To rebuild the indexes after updating the local GRUMP 1.3.5 long
table, run `scripts/build-explorer-data.py` from the website directory.
