const menuButton = document.querySelector(".menu-button");
const siteNavigation = document.querySelector(".site-nav");
const currentYear = document.querySelector("#currentYear");

if (currentYear) currentYear.textContent = new Date().getFullYear();

if (menuButton && siteNavigation) {
  menuButton.addEventListener("click", () => {
    const isOpen = siteNavigation.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });

  siteNavigation.addEventListener("click", (event) => {
    if (!event.target.closest("a")) return;
    siteNavigation.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
  });
}

const carousel = document.querySelector("[data-carousel]");
if (carousel) {
  const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
  const current = document.querySelector("[data-carousel-current]");
  let activeIndex = 0;

  const showSlide = (index) => {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle("is-active", slideIndex === activeIndex);
    });
    if (current) current.textContent = String(activeIndex + 1);
  };

  document.querySelector("[data-carousel-prev]")?.addEventListener("click", () => showSlide(activeIndex - 1));
  document.querySelector("[data-carousel-next]")?.addEventListener("click", () => showSlide(activeIndex + 1));
}

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.dataset.copyTarget);
    if (!target) return;

    try {
      await navigator.clipboard.writeText(target.textContent.trim());
      const originalLabel = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = originalLabel; }, 1600);
    } catch {
      button.textContent = "Select + copy";
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
});

const taxonomySearch = document.querySelector("#taxonomy-search");
const taxonomyResults = document.querySelector("#taxonomy-results");
const taxonomyStatus = document.querySelector("#taxonomy-status");
const taxonomySelectionLabel = document.querySelector("#taxonomy-selection-label");
const selectedTaxonomyCode = document.querySelector("#code-selected-taxonomy");
const abundanceCode = document.querySelector("#code-abundance");

if (
  taxonomySearch &&
  taxonomyResults &&
  Array.isArray(window.GRUMP_TAXA)
) {
  const displayRank = (rank) => rank.replaceAll("_", " ");
  const normalize = (value) => value.toLowerCase().replaceAll("_", " ");
  const escapeRString = (value) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

  const selectTaxon = (rank, name) => {
    const safeName = escapeRString(name);

    taxonomySelectionLabel.textContent = `${displayRank(rank)} · ${name}`;
    selectedTaxonomyCode.textContent =
`my_planktons_taxonomy <- grump_taxonomy %>%
  filter(${rank} %in% c("${safeName}"))

my_plankton_data <- grump_data %>%
  filter(${rank} %in% c("${safeName}"))`;

    abundanceCode.textContent =
`my_plankton_data <- my_plankton_data %>%
  group_by(SampleID, ${rank}) %>%
  mutate(
    Total_Relative_Abundance = sum(Relative_Abundance)
  ) %>%
  ungroup() %>%
  distinct(SampleID, .keep_all = TRUE)`;

    taxonomyStatus.textContent = `Selected ${displayRank(rank)}: ${name}`;
    taxonomyResults.replaceChildren();
  };

  const showMatches = () => {
    const query = normalize(taxonomySearch.value.trim());
    taxonomyResults.replaceChildren();

    if (query.length < 2) {
      taxonomyStatus.textContent = "Enter at least two characters to search.";
      return;
    }

    const matches = window.GRUMP_TAXA
      .filter(({ name }) => normalize(name).includes(query))
      .sort((a, b) => {
        const aStarts = normalize(a.name).startsWith(query) ? 0 : 1;
        const bStarts = normalize(b.name).startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 12);

    taxonomyStatus.textContent = matches.length
      ? `${matches.length} best match${matches.length === 1 ? "" : "es"} shown.`
      : "No matching taxonomy found.";

    matches.forEach(({ rank, name }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "taxonomy-result";
      button.setAttribute("role", "option");

      const taxonName = document.createElement("span");
      taxonName.textContent = name;
      const taxonRank = document.createElement("span");
      taxonRank.textContent = displayRank(rank);

      button.append(taxonName, taxonRank);
      button.addEventListener("click", () => selectTaxon(rank, name));
      taxonomyResults.append(button);
    });
  };

  taxonomySearch.addEventListener("input", showMatches);
}
