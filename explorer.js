(() => {
  const data = window.GRUMP_EXPLORER_DATA;
  const world = window.GRUMP_WORLD;
  const mapElement = document.querySelector("#grump-map");
  const depthElement = document.querySelector("#grump-depth-chart");
  const taxonomyLevel = document.querySelector("#taxonomy-level");
  const taxonSearch = document.querySelector("#taxon-search");
  const taxonOptions = document.querySelector("#taxon-options");
  const taxonSearchLabel = document.querySelector("#taxon-search-label");
  const applyTaxonSearchButton = document.querySelector("#apply-taxon-search");
  const clearTaxonSearchButton = document.querySelector("#clear-taxon-search");
  const clearLocationFiltersButton = document.querySelector("#clear-location-filters");
  const asvSearchHelp = document.querySelector("#asv-search-help");
  const status = document.querySelector("#explorer-status");
  const abundanceLegend = document.querySelector("#abundance-legend");
  const abundanceLegendLow = document.querySelector("#abundance-legend-low");
  const abundanceLegendMid = document.querySelector("#abundance-legend-mid");
  const abundanceLegendHigh = document.querySelector("#abundance-legend-high");
  const downloadMapImage = document.querySelector("#download-map-image");
  const downloadDepthImage = document.querySelector("#download-depth-image");
  const downloadExplorerData = document.querySelector("#download-explorer-data");

  if (!data || !world || !window.d3 || !window.topojson || !mapElement || !depthElement) {
    if (status) status.textContent = "The GRUMP explorer could not load. Please refresh the page.";
    return;
  }

  const { samples, levels } = data;
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const depthZoneOrder = [
    "Surface (0–10 m)",
    "Epipelagic (10–200 m)",
    "Mesopelagic (200–1,000 m)",
    "Deep ocean (>1,000 m)"
  ];
  const seasonOrder = ["Spring", "Summer", "Autumn", "Winter"];
  const filterDefinitions = [
    { key: "cruise", label: "Cruise", all: "All cruises", element: document.querySelector("#filter-cruise") },
    { key: "oceanBasin", label: "Ocean basin", all: "All ocean basins", element: document.querySelector("#filter-ocean-basin") },
    { key: "province", label: "Longhurst province", all: "All provinces", element: document.querySelector("#filter-province") },
    { key: "year", label: "Year", all: "All years", element: document.querySelector("#filter-year"), numeric: true },
    { key: "month", label: "Month", all: "All months", element: document.querySelector("#filter-month"), numeric: true, format: (value) => monthNames[Number(value) - 1] },
    { key: "season", label: "Season", all: "All seasons", element: document.querySelector("#filter-season"), order: seasonOrder },
    { key: "depthZone", label: "Depth category", all: "All depths", element: document.querySelector("#filter-depth-zone"), order: depthZoneOrder }
  ].filter(({ element }) => element);

  const displayName = (value) => String(value || "").replaceAll("_", " ");
  const normalizedName = (value) => displayName(value).toLowerCase().replace(/\s+/g, " ").trim();
  const formatPercent = (value) => `${d3.format(".3~g")(Number(value || 0) * 100)}%`;
  const loadedScripts = new Map();
  let selectedBiology = null;
  let currentTaxonLookup = new Map();
  let mapTransform = d3.zoomIdentity;

  const safeFilePart = (value) => String(value || "all-samples")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const activeFilters = () => filterDefinitions
    .filter(({ element }) => element.value && element.value !== "all")
    .map((definition) => ({ ...definition, value: definition.element.value }));

  const sampleMatchesFilters = (sample, excludedKey = null) => activeFilters().every(({ key, value }) =>
    key === excludedKey || String(sample[key]) === value
  );

  const getFilteredSamples = () => samples
    .map((sample, index) => ({ ...sample, index }))
    .filter((sample) => sampleMatchesFilters(sample));

  const currentFileStem = () => {
    const biology = selectedBiology ? selectedBiology.display : "sample-locations";
    const filters = activeFilters().length
      ? activeFilters().map(({ key, value }) => `${key}-${value}`).join("-")
      : "all-locations";
    return `grump-${safeFilePart(biology)}-${safeFilePart(filters)}`;
  };

  const downloadSvgAsPng = (svgElement, suffix) => {
    const clone = svgElement.cloneNode(true);
    const viewBox = svgElement.viewBox.baseVal;
    const width = viewBox.width || 1000;
    const height = viewBox.height || 500;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", width);
    clone.setAttribute("height", height);

    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
      svg { background: #ffffff; }
      .map-graticule { fill: none; stroke: #d8d8d2; stroke-width: 0.7; }
      .map-land { fill: #ecece7; stroke: #94948e; stroke-width: 0.8; }
      .map-sample-points circle, .depth-sample-points circle { fill: #c8c8c3; fill-opacity: 1; }
      .map-abundance-points circle, .depth-abundance-points circle { fill: #1768ac; stroke: #ffffff; stroke-width: 0.8; fill-opacity: 0.88; }
      .chart-grid line { stroke: #deded9; stroke-width: 1; }
      .chart-grid path { display: none; }
      .chart-axis path, .chart-axis line { stroke: #777772; }
      .chart-axis text, .chart-axis-label { fill: #666662; font-family: Arial, sans-serif; font-size: 12px; }
    `;
    clone.insertBefore(style, clone.firstChild);

    const source = new XMLSerializer().serializeToString(clone);
    const sourceBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const sourceUrl = URL.createObjectURL(sourceBlob);
    const image = new Image();

    image.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(sourceUrl);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${currentFileStem()}-${suffix}.png`);
      }, "image/png");
    };

    image.src = sourceUrl;
  };

  const csvCell = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  const getAbundanceMap = () => selectedBiology?.abundanceBySample || new Map();

  const downloadFilteredCsv = () => {
    const filteredSamples = getFilteredSamples();
    const abundanceBySample = getAbundanceMap();
    const columns = [
      "sample_index", "sample_id", "date", "latitude", "longitude", "depth_m", "cruise", "year", "month", "day",
      "longhurst_province", "ocean_basin", "season", "depth_category", "biological_level",
      "selected_value", "asv_hash", "asv_sequence", "total_relative_abundance_percent", "detected"
    ];
    const rows = filteredSamples.map((sample) => {
      const hasAbundance = selectedBiology && abundanceBySample.has(sample.index);
      return [
        sample.index + 1,
        (sample.sampleIDs || []).join("; "),
        formatSampleDate(sample),
        sample.lat,
        sample.lon,
        sample.depth,
        sample.cruise,
        sample.year,
        sample.month,
        sample.day,
        sample.province,
        sample.oceanBasin,
        sample.season,
        sample.depthZone,
        selectedBiology?.levelLabel || "",
        selectedBiology?.raw || "",
        selectedBiology?.kind === "asv" ? selectedBiology.hash : "",
        selectedBiology?.kind === "asv" ? selectedBiology.sequence : "",
        hasAbundance ? abundanceBySample.get(sample.index) * 100 : "",
        selectedBiology ? (hasAbundance ? "yes" : "no") : ""
      ];
    });
    const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    downloadBlob(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), `${currentFileStem()}-data.csv`);
  };

  const loadDataScript = (source) => {
    if (loadedScripts.has(source)) return loadedScripts.get(source);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${source}`));
      document.head.append(script);
    });
    loadedScripts.set(source, promise);
    return promise;
  };

  const md5Ascii = (input) => {
    const bytes = new TextEncoder().encode(input);
    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const bitLength = bytes.length * 8;
    const paddedView = new DataView(padded.buffer);
    paddedView.setUint32(paddedLength - 8, bitLength >>> 0, true);
    paddedView.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

    const shifts = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];
    const constants = Array.from({ length: 64 }, (_, index) =>
      Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
    );
    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    for (let offset = 0; offset < paddedLength; offset += 64) {
      const words = Array.from({ length: 16 }, (_, index) => paddedView.getUint32(offset + index * 4, true));
      let a = a0;
      let b = b0;
      let c = c0;
      let d = d0;

      for (let index = 0; index < 64; index += 1) {
        let mixed;
        let wordIndex;
        if (index < 16) {
          mixed = (b & c) | (~b & d);
          wordIndex = index;
        } else if (index < 32) {
          mixed = (d & b) | (~d & c);
          wordIndex = (5 * index + 1) % 16;
        } else if (index < 48) {
          mixed = b ^ c ^ d;
          wordIndex = (3 * index + 5) % 16;
        } else {
          mixed = c ^ (b | ~d);
          wordIndex = (7 * index) % 16;
        }
        const sum = (a + mixed + constants[index] + words[wordIndex]) >>> 0;
        const rotated = ((sum << shifts[index]) | (sum >>> (32 - shifts[index]))) >>> 0;
        [a, d, c, b] = [d, c, b, (b + rotated) >>> 0];
      }

      a0 = (a0 + a) >>> 0;
      b0 = (b0 + b) >>> 0;
      c0 = (c0 + c) >>> 0;
      d0 = (d0 + d) >>> 0;
    }

    return [a0, b0, c0, d0].map((word) =>
      [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0")).join("")
    ).join("");
  };

  const formatFilterValue = (definition, value) => definition.format ? definition.format(value) : value;

  const sortedFilterValues = (definition, candidateSamples) => {
    const values = [...new Set(candidateSamples.map((sample) => String(sample[definition.key] || "")).filter(Boolean))];
    if (definition.numeric) return values.sort((a, b) => Number(a) - Number(b));
    if (definition.order) return values.sort((a, b) => definition.order.indexOf(a) - definition.order.indexOf(b));
    return values.sort((a, b) => a.localeCompare(b));
  };

  const refreshLocationOptions = () => {
    filterDefinitions.forEach((definition) => {
      const currentValue = definition.element.value || "all";
      const candidateSamples = samples.filter((sample) => sampleMatchesFilters(sample, definition.key));
      const values = sortedFilterValues(definition, candidateSamples);
      definition.element.replaceChildren();

      const allOption = document.createElement("option");
      allOption.value = "all";
      allOption.textContent = definition.all;
      definition.element.append(allOption);

      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = formatFilterValue(definition, value);
        definition.element.append(option);
      });
      definition.element.value = values.includes(currentValue) ? currentValue : "all";
    });
  };

  const populateTaxonOptions = () => {
    taxonOptions.replaceChildren();
    currentTaxonLookup = new Map();
    const isAsv = taxonomyLevel.value === "ASV";
    asvSearchHelp.hidden = !isAsv;
    taxonSearchLabel.textContent = isAsv ? "ASV hash or sequence" : "Organism or group";
    taxonSearch.placeholder = isAsv ? "Paste an ASV hash or sequence" : "Start typing a name";

    if (isAsv) return;
    levels[taxonomyLevel.value].taxa.forEach(([rawValue, chunk]) => {
      const displayValue = displayName(rawValue);
      currentTaxonLookup.set(normalizedName(displayValue), [rawValue, chunk]);
      const option = document.createElement("option");
      option.value = displayValue;
      taxonOptions.append(option);
    });
  };

  const setSearchBusy = (busy) => {
    applyTaxonSearchButton.disabled = busy;
    applyTaxonSearchButton.textContent = busy ? "Loading…" : "Plot distribution";
  };

  const applyTaxonSearch = async () => {
    const query = taxonSearch.value.trim();
    if (!query) {
      selectedBiology = null;
      updateExplorer();
      return;
    }

    setSearchBusy(true);
    status.textContent = "Loading the selected GRUMP distribution…";

    try {
      if (taxonomyLevel.value === "ASV") {
        const condensed = query.replace(/\s+/g, "");
        const isHash = /^[a-f0-9]{32}$/i.test(condensed);
        const sequence = isHash ? "" : condensed.toUpperCase().replaceAll("U", "T");
        if (!isHash && !/^[ACGTN]+$/.test(sequence)) {
          throw new Error("Paste either a 32-character hexadecimal ASV hash or a complete nucleotide sequence.");
        }
        const asvHash = isHash ? condensed.toLowerCase() : md5Ascii(sequence);
        const prefix = asvHash.slice(0, 2);
        await loadDataScript(`data/asv/${prefix}.js`);
        const record = window.GRUMP_ASV_DATA?.[prefix]?.[asvHash];
        if (!record || (sequence && record[0] !== sequence)) {
          throw new Error("That ASV was not found in GRUMP 1.3.5.");
        }
        selectedBiology = {
          kind: "asv",
          raw: asvHash,
          hash: asvHash,
          sequence: record[0],
          display: `ASV ${asvHash}`,
          levelLabel: "ASV hash or sequence",
          abundanceBySample: new Map(record[1])
        };
        taxonSearch.value = asvHash;
      } else {
        const match = currentTaxonLookup.get(normalizedName(query));
        if (!match) throw new Error("Choose an exact organism or group from the search suggestions.");
        const [rawValue, chunk] = match;
        const levelKey = taxonomyLevel.value;
        await loadDataScript(`data/taxa/${levelKey}/${chunk}.js`);
        const values = window.GRUMP_TAXON_DATA?.[`${levelKey}:${chunk}`]?.[rawValue];
        if (!values) throw new Error("The selected distribution could not be loaded.");
        selectedBiology = {
          kind: "taxon",
          raw: rawValue,
          display: displayName(rawValue),
          levelLabel: levels[levelKey].label,
          abundanceBySample: new Map(values)
        };
        taxonSearch.value = displayName(rawValue);
      }
      updateExplorer();
    } catch (error) {
      selectedBiology = null;
      status.textContent = error.message;
      abundanceLegend.hidden = true;
      renderMap(getFilteredSamples(), new Map());
      renderDepthChart(getFilteredSamples(), new Map());
    } finally {
      setSearchBusy(false);
    }
  };

  Object.entries(levels).forEach(([key, level]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${level.label} (${level.taxa.length.toLocaleString()})`;
    taxonomyLevel.append(option);
  });
  const asvOption = document.createElement("option");
  asvOption.value = "ASV";
  asvOption.textContent = `ASV hash or sequence (${data.asv.count.toLocaleString()})`;
  taxonomyLevel.append(asvOption);
  taxonomyLevel.value = "Level_2";

  function formatSampleDate(sample) {
    return `${sample.year}-${String(sample.month).padStart(2, "0")}-${String(sample.day).padStart(2, "0")}`;
  }

  const sampleDescription = (sample) => [
    `SampleID: ${(sample.sampleIDs || []).join(", ") || "Not available"}`,
    `Latitude: ${sample.lat.toFixed(2)}`,
    `Longitude: ${sample.lon.toFixed(2)}`,
    `Date: ${formatSampleDate(sample)}`
  ].join("\n");

  const abundanceDescription = (sample) => [
    `Selection: ${selectedBiology?.display || ""}`,
    sampleDescription(sample),
    `Relative abundance: ${formatPercent(sample.abundance)}`
  ].join("\n");

  const updateAbundanceLegend = (filteredSamples, abundanceBySample) => {
    const visibleAbundances = filteredSamples
      .filter((sample) => abundanceBySample.has(sample.index))
      .map((sample) => abundanceBySample.get(sample.index));
    const maximum = d3.max(visibleAbundances) || 0;
    const legendValues = [maximum * 0.1, maximum * 0.5, maximum];
    [abundanceLegendLow, abundanceLegendMid, abundanceLegendHigh].forEach((element, index) => {
      if (element) element.textContent = formatPercent(legendValues[index]);
    });
  };

  const land = topojson.feature(world, world.objects.land);
  const projection = d3.geoNaturalEarth1()
    .rotate([150, 0])
    .fitExtent([[24, 24], [976, 490]], land);
  const geoPath = d3.geoPath(projection);

  const renderMap = (filteredSamples, abundanceBySample) => {
    const svg = d3.select(mapElement);
    svg.selectAll("*").remove();
    const viewport = svg.append("g").attr("class", "map-viewport");
    const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .extent([[0, 0], [1000, 520]])
      .translateExtent([[-500, -260], [1500, 780]])
      .on("zoom", (event) => {
        mapTransform = event.transform;
        viewport.attr("transform", mapTransform);
      });

    svg.call(zoom).call(zoom.transform, mapTransform);
    viewport.append("path").datum(d3.geoGraticule10()).attr("class", "map-graticule").attr("d", geoPath);
    viewport.append("path").datum(land).attr("class", "map-land").attr("d", geoPath);

    const plottedSamples = filteredSamples.filter((sample) => projection([sample.lon, sample.lat]));
    const basePoints = viewport.append("g")
      .attr("class", "map-sample-points")
      .selectAll("circle")
      .data(plottedSamples)
      .join("circle")
      .attr("cx", (sample) => projection([sample.lon, sample.lat])[0])
      .attr("cy", (sample) => projection([sample.lon, sample.lat])[1])
      .attr("r", 2.4);
    basePoints.append("title").text(sampleDescription);

    if (!selectedBiology) return;
    const abundanceSamples = plottedSamples
      .filter((sample) => abundanceBySample.has(sample.index))
      .map((sample) => ({ ...sample, abundance: abundanceBySample.get(sample.index) }));
    const maximum = d3.max(abundanceSamples, (sample) => sample.abundance) || 1;
    const radius = d3.scaleSqrt().domain([0, maximum]).range([2.8, 13]);
    const abundancePoints = viewport.append("g")
      .attr("class", "map-abundance-points")
      .selectAll("circle")
      .data(abundanceSamples.sort((a, b) => b.abundance - a.abundance))
      .join("circle")
      .attr("cx", (sample) => projection([sample.lon, sample.lat])[0])
      .attr("cy", (sample) => projection([sample.lon, sample.lat])[1])
      .attr("r", (sample) => radius(sample.abundance));
    abundancePoints.append("title").text(abundanceDescription);
  };

  const renderDepthChart = (filteredSamples, abundanceBySample) => {
    const svg = d3.select(depthElement);
    svg.selectAll("*").remove();
    const width = 1000;
    const height = 500;
    const margin = { top: 24, right: 28, bottom: 62, left: 82 };
    const maximumDepth = Math.max(10, d3.max(filteredSamples, (sample) => sample.depth) || 10);
    const x = d3.scaleLinear().domain([-90, 90]).range([margin.left, width - margin.right]);
    const y = d3.scaleSymlog().constant(20).domain([0, maximumDepth]).range([margin.top, height - margin.bottom]);
    const depthTicks = [0, 10, 50, 200, 1000, 3000, 6000].filter((tick) => tick <= maximumDepth);

    svg.append("g").attr("class", "chart-grid").attr("transform", `translate(${margin.left},0)`).call(
      d3.axisLeft(y).tickValues(depthTicks).tickSize(-(width - margin.left - margin.right)).tickFormat("")
    );
    svg.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${height - margin.bottom})`).call(
      d3.axisBottom(x).tickValues([-90, -60, -30, 0, 30, 60, 90]).tickFormat((value) => `${Math.abs(value)}°${value < 0 ? "S" : value > 0 ? "N" : ""}`)
    );
    svg.append("g").attr("class", "chart-axis").attr("transform", `translate(${margin.left},0)`).call(
      d3.axisLeft(y).tickValues(depthTicks).tickFormat((value) => value.toLocaleString())
    );
    svg.append("text").attr("class", "chart-axis-label")
      .attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 14)
      .attr("text-anchor", "middle").text("Latitude");
    svg.append("text").attr("class", "chart-axis-label").attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + height - margin.bottom) / 2).attr("y", 22)
      .attr("text-anchor", "middle").text("Depth (m)");

    const basePoints = svg.append("g").attr("class", "depth-sample-points")
      .selectAll("circle").data(filteredSamples).join("circle")
      .attr("cx", (sample) => x(sample.lat)).attr("cy", (sample) => y(sample.depth)).attr("r", 2.2);
    basePoints.append("title").text(sampleDescription);

    if (!selectedBiology) return;
    const abundanceSamples = filteredSamples
      .filter((sample) => abundanceBySample.has(sample.index))
      .map((sample) => ({ ...sample, abundance: abundanceBySample.get(sample.index) }));
    const maximum = d3.max(abundanceSamples, (sample) => sample.abundance) || 1;
    const radius = d3.scaleSqrt().domain([0, maximum]).range([2.8, 12]);
    const abundancePoints = svg.append("g").attr("class", "depth-abundance-points")
      .selectAll("circle").data(abundanceSamples.sort((a, b) => b.abundance - a.abundance)).join("circle")
      .attr("cx", (sample) => x(sample.lat)).attr("cy", (sample) => y(sample.depth))
      .attr("r", (sample) => radius(sample.abundance));
    abundancePoints.append("title").text(abundanceDescription);
  };

  const updateExplorer = () => {
    const filteredSamples = getFilteredSamples();
    const abundanceBySample = getAbundanceMap();
    const matchingSamples = selectedBiology
      ? filteredSamples.filter((sample) => abundanceBySample.has(sample.index)).length
      : filteredSamples.length;
    const filterText = activeFilters().length
      ? activeFilters().map((definition) => `${definition.label}: ${formatFilterValue(definition, definition.value)}`).join(" · ")
      : "all sampling locations";

    status.textContent = selectedBiology
      ? `${selectedBiology.display} occurs in ${matchingSamples.toLocaleString()} of ${filteredSamples.length.toLocaleString()} samples for ${filterText}.`
      : `${filteredSamples.length.toLocaleString()} samples shown for ${filterText}. Search an organism, group, ASV hash, or ASV sequence to plot total relative abundance.`;
    abundanceLegend.hidden = !selectedBiology;
    updateAbundanceLegend(filteredSamples, abundanceBySample);
    renderMap(filteredSamples, abundanceBySample);
    renderDepthChart(filteredSamples, abundanceBySample);
  };

  filterDefinitions.forEach(({ element }) => {
    element.addEventListener("change", () => {
      refreshLocationOptions();
      updateExplorer();
    });
  });
  clearLocationFiltersButton.addEventListener("click", () => {
    filterDefinitions.forEach(({ element }) => { element.value = "all"; });
    refreshLocationOptions();
    updateExplorer();
  });
  taxonomyLevel.addEventListener("change", () => {
    selectedBiology = null;
    taxonSearch.value = "";
    populateTaxonOptions();
    updateExplorer();
  });
  applyTaxonSearchButton.addEventListener("click", applyTaxonSearch);
  taxonSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyTaxonSearch();
    }
  });
  clearTaxonSearchButton.addEventListener("click", () => {
    selectedBiology = null;
    taxonSearch.value = "";
    updateExplorer();
  });
  downloadMapImage.addEventListener("click", () => downloadSvgAsPng(mapElement, "map"));
  downloadDepthImage.addEventListener("click", () => downloadSvgAsPng(depthElement, "cross-section"));
  downloadExplorerData.addEventListener("click", downloadFilteredCsv);

  refreshLocationOptions();
  populateTaxonOptions();
  updateExplorer();
})();
