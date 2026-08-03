#!/usr/bin/env python3
"""Build compact, lazy-loaded browser indexes from the GRUMP long table."""

from __future__ import annotations

import csv
import gc
import hashlib
import json
import math
import shutil
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "04-Data/version-1.3/grump_asv_long_version-1.3.5.csv"
CORE_OUTPUT = ROOT / "data/grump-explorer-data.js"
TAXON_OUTPUT = ROOT / "data/taxa"
ASV_OUTPUT = ROOT / "data/asv"

LEVEL_GROUPS = [
    ["Domain", "Supergroup", "Division", "Phylum", "Class", "Order", "Family"],
    ["Genus", "Species", "ProPortal_ASV_Ecotype", "Sequence_Type"],
    ["Level_1", "Level_1_1", "Level_2", "Eco_relevant_plank_groups"],
]

LEVEL_LABELS = {
    "Level_1": "Broad domain",
    "Level_1_1": "Domain / marker",
    "Level_2": "Major group",
    "Eco_relevant_plank_groups": "Ecologically relevant group",
    "Domain": "Domain",
    "Supergroup": "Supergroup",
    "Division": "Division",
    "Phylum": "Phylum",
    "Class": "Class",
    "Order": "Order",
    "Family": "Family",
    "Genus": "Genus",
    "Species": "Species",
    "ProPortal_ASV_Ecotype": "ProPortal ASV ecotype",
    "Sequence_Type": "Sequence type",
}

LEVEL_ORDER = [
    "Level_1",
    "Level_1_1",
    "Level_2",
    "Eco_relevant_plank_groups",
    "Domain",
    "Supergroup",
    "Division",
    "Phylum",
    "Class",
    "Order",
    "Family",
    "Genus",
    "Species",
    "ProPortal_ASV_Ecotype",
    "Sequence_Type",
]


def compact_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def rounded(value: float) -> float:
    return float(f"{value:.10g}")


def number(value: str | int | float | None) -> float:
    try:
        return round(float(value or 0), 6)
    except (TypeError, ValueError):
        return 0.0


def integer(value: str | int | float | None) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def sample_number(value: str | int | float | None) -> float:
    """Match the two-decimal precision used by the published explorer summary."""
    return round(number(value), 2)


def depth_zone(depth: float) -> str:
    if depth <= 10:
        return "Surface (0–10 m)"
    if depth <= 200:
        return "Epipelagic (10–200 m)"
    if depth <= 1000:
        return "Mesopelagic (200–1,000 m)"
    return "Deep ocean (>1,000 m)"


def existing_sample_key(sample: dict) -> tuple:
    return (
        sample_number(sample.get("lat")),
        sample_number(sample.get("lon")),
        sample_number(sample.get("depth")),
        str(sample.get("cruise", "")).strip(),
        integer(sample.get("year")),
        integer(sample.get("month")),
        integer(sample.get("day")),
        str(sample.get("province", "")).strip(),
    )


def source_sample_key(row: dict) -> tuple:
    return (
        sample_number(row.get("Latitude") or row.get("lat")),
        sample_number(row.get("Longitude") or row.get("lon")),
        sample_number(row.get("depth")),
        str(row.get("Cruise_ID", "")).strip(),
        integer(row.get("Year")),
        integer(row.get("Month")),
        integer(row.get("Day")),
        str(row.get("Longhurst_Long", "")).strip(),
    )


def load_existing_samples() -> list[dict]:
    text = CORE_OUTPUT.read_text(encoding="utf-8")
    payload = text.split("=", 1)[1].strip().removesuffix(";")
    return json.loads(payload)["samples"]


def chunk_for_taxon(field: str, taxon: str) -> str:
    digest = hashlib.sha1(f"{field}\0{taxon}".encode("utf-8")).digest()[0]
    return f"{digest % 64:02x}"


def is_unassigned(row: dict) -> bool:
    return row.get("Domain", "").strip().casefold() == "unassigned"


def write_taxon_chunks(field: str, values_by_taxon: dict[str, dict[int, float]]) -> list[list[str]]:
    destination = TAXON_OUTPUT / field
    destination.mkdir(parents=True, exist_ok=True)
    taxa_by_chunk: dict[str, list[str]] = defaultdict(list)

    for taxon in values_by_taxon:
        taxa_by_chunk[chunk_for_taxon(field, taxon)].append(taxon)

    for chunk, taxa in taxa_by_chunk.items():
        payload = {}
        for taxon in sorted(taxa, key=str.casefold):
            payload[taxon] = [
                [sample_index, rounded(abundance)]
                for sample_index, abundance in sorted(values_by_taxon[taxon].items())
                if abundance > 0
            ]
        script = (
            "window.GRUMP_TAXON_DATA=window.GRUMP_TAXON_DATA||{};"
            f"window.GRUMP_TAXON_DATA[{compact_json(f'{field}:{chunk}')}].="
        )
        # Keep the assignment easy to inspect while retaining compact generated files.
        script = script.replace("].=", "]=") + compact_json(payload) + ";\n"
        (destination / f"{chunk}.js").write_text(script, encoding="utf-8")

    return [
        [taxon, chunk_for_taxon(field, taxon)]
        for taxon in sorted(values_by_taxon, key=str.casefold)
    ]


def scan_samples(samples: list[dict], sample_lookup: dict[tuple, int]) -> None:
    unmatched = 0
    sample_ids = [set() for _ in samples]
    with SOURCE.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            sample_index = sample_lookup.get(source_sample_key(row))
            if sample_index is None:
                unmatched += 1
                continue
            sample = samples[sample_index]
            if not sample.get("oceanBasin"):
                sample["oceanBasin"] = row.get("Ocean_Basin", "").strip().replace("_", " ").replace(".", " ")
            if not sample.get("season"):
                sample["season"] = row.get("Season", "").strip()
            sample_id = row.get("SampleID", "").strip()
            if sample_id:
                sample_ids[sample_index].add(sample_id)

    if unmatched:
        raise RuntimeError(f"{unmatched:,} source rows did not match an explorer sample")

    for sample, identifiers in zip(samples, sample_ids):
        sample["depthZone"] = depth_zone(number(sample.get("depth")))
        sample.setdefault("oceanBasin", "")
        sample.setdefault("season", "")
        sample["sampleIDs"] = sorted(identifiers, key=str.casefold)


def build_taxonomy(sample_lookup: dict[tuple, int]) -> dict[str, dict]:
    level_index: dict[str, dict] = {}

    for fields in LEVEL_GROUPS:
        print(f"Scanning taxonomy group: {', '.join(fields)}", flush=True)
        grouped = {field: defaultdict(dict) for field in fields}

        with SOURCE.open(newline="", encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                if is_unassigned(row):
                    continue
                sample_index = sample_lookup[source_sample_key(row)]
                try:
                    abundance = float(row.get("Relative_Abundance") or 0)
                except ValueError:
                    continue
                if not math.isfinite(abundance) or abundance <= 0:
                    continue

                for field in fields:
                    taxon = row.get(field, "").strip()
                    if not taxon:
                        continue
                    sample_values = grouped[field][taxon]
                    sample_values[sample_index] = sample_values.get(sample_index, 0.0) + abundance

        for field in fields:
            taxa = write_taxon_chunks(field, grouped[field])
            level_index[field] = {"label": LEVEL_LABELS[field], "taxa": taxa}
            print(f"  {field}: {len(taxa):,} searchable values", flush=True)
        del grouped
        gc.collect()

    return {field: level_index[field] for field in LEVEL_ORDER}


def build_asv(sample_lookup: dict[tuple, int]) -> tuple[int, int]:
    print("Scanning exact ASV hashes and sequences", flush=True)
    asv_values: dict[str, list] = {}
    excluded_hashes: set[str] = set()

    with SOURCE.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            asv_hash = row.get("ASV_hash", "").strip().lower()
            if is_unassigned(row):
                if asv_hash:
                    excluded_hashes.add(asv_hash)
                continue
            sequence = "".join(row.get("ASV", "").split()).upper()
            if not asv_hash or not sequence:
                continue
            try:
                abundance = float(row.get("Relative_Abundance") or 0)
            except ValueError:
                continue
            if not math.isfinite(abundance) or abundance <= 0:
                continue

            sample_index = sample_lookup[source_sample_key(row)]
            if asv_hash not in asv_values:
                asv_values[asv_hash] = [sequence, {}]
            sample_values = asv_values[asv_hash][1]
            sample_values[sample_index] = sample_values.get(sample_index, 0.0) + abundance

    by_prefix: dict[str, list[str]] = defaultdict(list)
    for asv_hash in asv_values:
        by_prefix[asv_hash[:2]].append(asv_hash)

    ASV_OUTPUT.mkdir(parents=True, exist_ok=True)
    for prefix, hashes in by_prefix.items():
        payload = {}
        for asv_hash in sorted(hashes):
            sequence, sample_values = asv_values[asv_hash]
            payload[asv_hash] = [
                sequence,
                [
                    [sample_index, rounded(abundance)]
                    for sample_index, abundance in sorted(sample_values.items())
                    if abundance > 0
                ],
            ]
        script = (
            "window.GRUMP_ASV_DATA=window.GRUMP_ASV_DATA||{};"
            f"window.GRUMP_ASV_DATA[{compact_json(prefix)}]={compact_json(payload)};\n"
        )
        (ASV_OUTPUT / f"{prefix}.js").write_text(script, encoding="utf-8")

    count = len(asv_values)
    print(f"  ASV: {count:,} exact hashes and sequences", flush=True)
    print(f"  Excluded unassigned ASVs: {len(excluded_hashes):,}", flush=True)
    return count, len(excluded_hashes)


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"GRUMP source table not found: {SOURCE}")

    samples = load_existing_samples()
    sample_lookup = {existing_sample_key(sample): index for index, sample in enumerate(samples)}
    if len(sample_lookup) != len(samples):
        raise RuntimeError("Existing explorer samples contain duplicate metadata keys")

    shutil.rmtree(TAXON_OUTPUT, ignore_errors=True)
    shutil.rmtree(ASV_OUTPUT, ignore_errors=True)

    print(f"Matching metadata for {len(samples):,} plotted samples", flush=True)
    scan_samples(samples, sample_lookup)
    levels = build_taxonomy(sample_lookup)
    asv_count, excluded_asv_count = build_asv(sample_lookup)

    payload = {
        "samples": samples,
        "levels": levels,
        "asv": {
            "label": "ASV hash or sequence",
            "count": asv_count,
            "excludedUnassignedCount": excluded_asv_count,
        },
        "sourceVersion": "GRUMP 1.3.5",
    }
    CORE_OUTPUT.write_text(
        "window.GRUMP_EXPLORER_DATA = " + compact_json(payload) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote browser index for {len(samples):,} plotted samples", flush=True)


if __name__ == "__main__":
    main()
