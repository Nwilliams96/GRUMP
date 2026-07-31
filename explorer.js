(() => {
  const data = window.GRUMP_EXPLORER_DATA;
  const world = window.GRUMP_WORLD;
  const mapElement = document.querySelector("#grump-map");
  const depthElement = document.querySelector("#grump-depth-chart");
  const locationField = document.querySelector("#location-field");
  const locationValue = document.querySelector("#location-value");
  const taxonomyLevel = document.querySelector("#taxonomy-level");
  const taxonValue = document.querySelector("#taxon-value");
  const status = document.querySelector("#explorer-status");
  const abundanceLegend = document.querySelector("#abundance-legend");
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
  const locationConfig = {
    cruise: { label: "Cruise", format: (value) => value },
    province: { label: "Longhurst province", format: (value) => value },
    year: { label: "Year", format: (value) => value },
    month: { label: "Month", format: (value) => monthNames[Number(value) - 1] },
    depthZone: { label: "Depth zone", format: (value) => value }
  };

  const displayName = (value) => value.replaceAll("_", " ");
  const formatAbundance = d3.format(".3~g");

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

  const currentFileStem = () => {
    const taxon = taxonValue.value ? displayName(taxonValue.value) : "sample-locations";
    const location = locationField.value === "all"
      ? "all-locations"
      : `${locationField.value}-${locationValue.value}`;
    return `grump-${safeFilePart(taxon)}-${safeFilePart(location)}`;
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
      .map-abundance-points circle, .depth-abundance-points circle { fill: #176b87; stroke: #ffffff; stroke-width: 0.8; fill-opacity: 0.88; }
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

  const downloadFilteredCsv = () => {
    const filteredSamples = getFilteredSamples();
    const abundanceBySample = getAbundanceMap();
    const selectedTaxon = taxonValue.value;
    const level = levels[taxonomyLevel.value];
    const columns = [
      "sample_index", "latitude", "longitude", "depth_m", "cruise", "year", "month", "day",
      "longhurst_province", "depth_zone", "taxonomy_level", "selected_taxon",
      "total_relative_abundance", "detected"
    ];
    const rows = filteredSamples.map((sample) => {
      const hasAbundance = selectedTaxon && abundanceBySample.has(sample.index);
      return [
        sample.index + 1,
        sample.lat,
        sample.lon,
        sample.depth,
        sample.cruise,
        sample.year,
        sample.month,
        sample.day,
        sample.province,
        sample.depthZone,
        selectedTaxon ? level.label : "",
        selectedTaxon ? displayName(selectedTaxon) : "",
        hasAbundance ? abundanceBySample.get(sample.index) : "",
        selectedTaxon ? (hasAbundance ? "yes" : "no") : ""
      ];
    });
    const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    downloadBlob(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), `${currentFileStem()}-data.csv`);
  };

  Object.entries(levels).forEach(([key, level]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = level.label;
    taxonomyLevel.append(option);
  });
  taxonomyLevel.value = "Level_2";

  const populateTaxa = () => {
    const level = levels[taxonomyLevel.value];
    taxonValue.replaceChildren();

    const baseOption = document.createElement("option");
    baseOption.value = "";
    baseOption.textContent = "Samples only";
    taxonValue.append(baseOption);

    level.taxa.forEach((taxon) => {
      const option = document.createElement("option");
      option.value = taxon;
      option.textContent = displayName(taxon);
      taxonValue.append(option);
    });
  };

  const populateLocationValues = () => {
    const field = locationField.value;
    locationValue.replaceChildren();

    if (field === "all") {
      const option = document.createElement("option");
      option.value = "all";
      option.textContent = "All samples";
      locationValue.append(option);
      locationValue.disabled = true;
      return;
    }

    locationValue.disabled = false;
    let values = [...new Set(samples.map((sample) => String(sample[field])))];

    if (field === "year" || field === "month") {
      values.sort((a, b) => Number(a) - Number(b));
    } else if (field === "depthZone") {
      values.sort((a, b) => depthZoneOrder.indexOf(a) - depthZoneOrder.indexOf(b));
    } else {
      values.sort((a, b) => a.localeCompare(b));
    }

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = locationConfig[field].format(value);
      locationValue.append(option);
    });
  };

  const getFilteredSamples = () => {
    const field = locationField.value;
    const value = locationValue.value;

    return samples
      .map((sample, index) => ({ ...sample, index }))
      .filter((sample) => field === "all" || String(sample[field]) === value);
  };

  const getAbundanceMap = () => {
    const taxon = taxonValue.value;
    if (!taxon) return new Map();

    const level = levels[taxonomyLevel.value];
    const taxonIndex = level.taxa.indexOf(taxon);
    return new Map(
      level.values
        .filter((entry) => entry[1] === taxonIndex)
        .map((entry) => [entry[0], entry[2]])
    );
  };

  const sampleDescription = (sample) => [
    sample.cruise,
    `${sample.lat.toFixed(2)}°, ${sample.lon.toFixed(2)}°`,
    `${sample.depth.toLocaleString()} m`,
    `${monthNames[sample.month - 1]} ${sample.year}`,
    sample.province
  ].join(" · ");

  const land = topojson.feature(world, world.objects.land);
  const projection = d3.geoNaturalEarth1()
    .rotate([150, 0])
    .fitExtent([[24, 24], [976, 490]], land);
  const geoPath = d3.geoPath(projection);
  let mapTransform = d3.zoomIdentity;

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

    viewport.append("path")
      .datum(d3.geoGraticule10())
      .attr("class", "map-graticule")
      .attr("d", geoPath);

    viewport.append("path")
      .datum(land)
      .attr("class", "map-land")
      .attr("d", geoPath);

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

    if (!taxonValue.value) return;

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

    abundancePoints.append("title").text((sample) =>
      `${displayName(taxonValue.value)}: ${formatAbundance(sample.abundance)} total relative abundance · ${sampleDescription(sample)}`
    );
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

    svg.append("g")
      .attr("class", "chart-grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3.axisLeft(y)
          .tickValues(depthTicks)
          .tickSize(-(width - margin.left - margin.right))
          .tickFormat("")
      );

    svg.append("g")
      .attr("class", "chart-axis")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickValues([-90, -60, -30, 0, 30, 60, 90]).tickFormat((value) => `${Math.abs(value)}°${value < 0 ? "S" : value > 0 ? "N" : ""}`));

    svg.append("g")
      .attr("class", "chart-axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickValues(depthTicks).tickFormat((value) => value.toLocaleString()));

    svg.append("text")
      .attr("class", "chart-axis-label")
      .attr("x", (margin.left + width - margin.right) / 2)
      .attr("y", height - 14)
      .attr("text-anchor", "middle")
      .text("Latitude");

    svg.append("text")
      .attr("class", "chart-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -(margin.top + height - margin.bottom) / 2)
      .attr("y", 22)
      .attr("text-anchor", "middle")
      .text("Depth (m)");

    const basePoints = svg.append("g")
      .attr("class", "depth-sample-points")
      .selectAll("circle")
      .data(filteredSamples)
      .join("circle")
      .attr("cx", (sample) => x(sample.lat))
      .attr("cy", (sample) => y(sample.depth))
      .attr("r", 2.2);

    basePoints.append("title").text(sampleDescription);

    if (!taxonValue.value) return;

    const abundanceSamples = filteredSamples
      .filter((sample) => abundanceBySample.has(sample.index))
      .map((sample) => ({ ...sample, abundance: abundanceBySample.get(sample.index) }));
    const maximum = d3.max(abundanceSamples, (sample) => sample.abundance) || 1;
    const radius = d3.scaleSqrt().domain([0, maximum]).range([2.8, 12]);

    const abundancePoints = svg.append("g")
      .attr("class", "depth-abundance-points")
      .selectAll("circle")
      .data(abundanceSamples.sort((a, b) => b.abundance - a.abundance))
      .join("circle")
      .attr("cx", (sample) => x(sample.lat))
      .attr("cy", (sample) => y(sample.depth))
      .attr("r", (sample) => radius(sample.abundance));

    abundancePoints.append("title").text((sample) =>
      `${displayName(taxonValue.value)}: ${formatAbundance(sample.abundance)} total relative abundance · ${sampleDescription(sample)}`
    );
  };

  const updateExplorer = () => {
    const filteredSamples = getFilteredSamples();
    const abundanceBySample = getAbundanceMap();
    const selectedTaxon = taxonValue.value;
    const matchingSamples = selectedTaxon
      ? filteredSamples.filter((sample) => abundanceBySample.has(sample.index)).length
      : filteredSamples.length;
    const locationText = locationField.value === "all"
      ? "all sampling locations"
      : `${locationConfig[locationField.value].label}: ${locationConfig[locationField.value].format(locationValue.value)}`;

    status.textContent = selectedTaxon
      ? `${displayName(selectedTaxon)} occurs in ${matchingSamples.toLocaleString()} of ${filteredSamples.length.toLocaleString()} samples for ${locationText}.`
      : `${filteredSamples.length.toLocaleString()} samples shown for ${locationText}. Select an organism or group to plot total relative abundance.`;

    abundanceLegend.hidden = !selectedTaxon;
    renderMap(filteredSamples, abundanceBySample);
    renderDepthChart(filteredSamples, abundanceBySample);
  };

  locationField.addEventListener("change", () => {
    populateLocationValues();
    updateExplorer();
  });
  locationValue.addEventListener("change", updateExplorer);
  taxonomyLevel.addEventListener("change", () => {
    populateTaxa();
    updateExplorer();
  });
  taxonValue.addEventListener("change", updateExplorer);
  downloadMapImage.addEventListener("click", () => downloadSvgAsPng(mapElement, "map"));
  downloadDepthImage.addEventListener("click", () => downloadSvgAsPng(depthElement, "cross-section"));
  downloadExplorerData.addEventListener("click", downloadFilteredCsv);

  populateLocationValues();
  populateTaxa();
  updateExplorer();
})();
