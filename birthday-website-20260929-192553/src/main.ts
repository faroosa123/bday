import "./styles.css";

type Memory = { image: string; alt: string; label: string; note: string };
type NotebookPage = { label: string; kicker: string; render: () => string };
type Copy = { margin: string; letterOne: string; letterTwo: string; archiveIntro: string; drinks: string; food: string; closing: string };

const memories: Memory[] = [
  { image: "/assets/IMG_1802.jpg", alt: "Two pink fruit drinks with lime and mint", label: "the pink drinks", note: "same table, same chaos, very good drinks" },
  { image: "/assets/coffee.jpg", alt: "A latte and dessert on a wooden table", label: "coffee runs", note: "we somehow always say we are just getting coffee" },
  { image: "/assets/dinner.jpg", alt: "A plate of cheesy chicken, fries, and a saucy dish", label: "dinner dates", note: "ordering way too much and finishing it anyway" },
  { image: "/assets/chicken.jpg", alt: "Two trays of saucy fried chicken", label: "wing night", note: "the important question: which sauce wins?" },
  { image: "/assets/coffee-shop.jpg", alt: "Two iced coffees with whipped cream", label: "coffee shop moments", note: "just us, talking about everything and nothing" },
  { image: "/assets/burger-night.jpg", alt: "A burger, fries, and a green fizzy drink", label: "burger night", note: "not fancy, just exactly what we wanted" }
];

const defaults: Copy = {
  margin: "missing you bru",
  letterOne: "your highkey the greatest older brother ever gng, we had sm memories when u were here in qatar, eating, drinking, dying from laughter and shi everything",
  letterTwo: "so this is a website with a sneak peek of the memories we did (food and drinks lol)",
  archiveIntro: "sum of my fav memories is when we go out with metro or riding the car on jummah and as usual get drinks",
  drinks: "the cafe day in egypt, the bo's coffee we always get, and the one time city center spanish latte with peak aesthetics",
  food: "our b1g1 outback meals, the random talabat meal that finished all my money, and the crazy wings from salt that was bangin",
  closing: "I hope u enjoy ur bday hbb❤️❤️"
};

let copy: Copy = { ...defaults };
try { copy = { ...defaults, ...JSON.parse(localStorage.getItem("birthday-notebook-copy") ?? "{}") as Partial<Copy> }; } catch { /* use defaults */ }

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root");

const tape = (tone: string, extra = "") => `<span class="tape tape-${tone} ${extra}" aria-hidden="true"></span>`;
const polaroid = (memory: Memory, className = "") => `<figure class="polaroid ${className}"><div class="photo-wrap"><img src="${memory.image}" alt="${memory.alt}" /></div><figcaption><strong>${memory.label}</strong><span>${memory.note}</span></figcaption></figure>`;

const pages: NotebookPage[] = [
  { label: "the letter", kicker: "page 01 · open when you miss me", render: () => `
    <div class="page-header"><span>memory notebook no. 01</span><span>29 / 09 / 26</span></div>
    <div class="letter-layout"><aside class="margin-note note-yellow">${tape("pink", "tape-corner")}<span class="eyebrow">a very important note</span><p data-copy="margin">${copy.margin}</p><span class="scribble">love, your favorite sibling ♡</span></aside><div class="letter-copy-wrap">${tape("blue")}<span class="eyebrow">dear big brother,</span><h1>happy birthday to my favorite older brother <span class="hand-heart">♡</span></h1><p data-copy="letterOne">${copy.letterOne}</p><p data-copy="letterTwo">${copy.letterTwo}</p><div class="signature-row"><span>always your sibling,</span><strong>♡ me</strong></div></div></div><span class="page-doodle">best big bro ✦</span>` },
  { label: "the archive", kicker: "page 02 · the little archive", render: () => `
    <div class="page-header"><span>${pages[1].kicker}</span><span>ordinary days, best memories</span></div><div class="page-title-row"><div><span class="eyebrow">a small collection of proof</span><h2>some memories that<br /><em>we</em> made</h2></div><p data-copy="archiveIntro">${copy.archiveIntro}</p></div><div class="archive-notes"><div class="archive-list"><span>01</span><p>driving the car and playing music on jummah</p><span>02</span><p>when u booked uber to our house instead of golf club</p><span>03</span><p>ordering food even tho mama made food</p><span>04</span><p>dying laughter over the tiniest jokes</p></div><div class="archive-card note-yellow">${tape("blue", "tape-corner")}<span class="eyebrow">filed under: us</span><strong>same people.<br />new snack.</strong><span class="archive-star">✦</span></div></div>` },
  { label: "drinks", kicker: "page 03 · the drinks we had together", render: () => `
    <div class="page-header"><span>${pages[2].kicker}</span><span>sip sip hooray</span></div><div class="split-page drinks-page"><div class="colored-note note-pink">${tape("green", "tape-left")}<span class="note-number">03 / A</span><span class="eyebrow">the drinks we had together</span><h2>insane<br /><em>drinks</em></h2><p data-copy="drinks">${copy.drinks}</p></div><div class="drink-collage">${polaroid(memories[0], "tilt-left")}${polaroid(memories[1], "tilt-right drink-middle")}${polaroid(memories[4], "tilt-left drink-small")}</div></div>` },
  { label: "food", kicker: "page 04 · the food we had together", render: () => `
    <div class="page-header"><span>${pages[3].kicker}</span><span>the good stuff</span></div><div class="split-page food-page"><div class="colored-note note-green">${tape("purple", "tape-right")}<span class="note-number">04 / B</span><span class="eyebrow">the food we had together</span><h2>best<br /><em>munches</em></h2><p data-copy="food">${copy.food}</p></div><div class="food-collage">${polaroid(memories[2], "tilt-left food-main")}${polaroid(memories[3], "tilt-right food-middle")}${polaroid(memories[5], "tilt-left food-small")}</div></div>` },
  { label: "more of this", kicker: "page 05 · definitely not the last memory", render: () => `
    <div class="page-header"><span>${pages[4].kicker}</span><span>to be continued...</span></div><div class="closing-layout"><div class="closing-card">${tape("peach", "tape-corner")}<span class="eyebrow">last page · but not the last memory</span><h2>here’s to more<br /><em>of this</em></h2><p data-copy="closing">${copy.closing}</p></div><div class="closing-doodle" aria-hidden="true">more memories<br />coming soon <span>✦</span></div></div>` }
];

let currentPage = 0;
let isAnimating = false;
let pageThreeClicks = 0;

app.innerHTML = `<div class="site-shell"><div class="grain" aria-hidden="true"></div><main class="notebook-stage"><div class="notebook" aria-label="Birthday memory notebook"><div class="notebook-spine" aria-hidden="true"><span class="spiral spiral-1"></span><span class="spiral spiral-2"></span><span class="spiral spiral-3"></span><span class="spiral spiral-4"></span><span class="spiral spiral-5"></span><span class="spine-label">BIRTHDAY<br />NOTES</span></div><div class="book-shadow" aria-hidden="true"></div><article class="page page-paper page-underlay" data-under-page aria-hidden="true"></article><article class="page page-paper" data-page role="article" aria-live="polite"></article><button class="page-hotspot page-hotspot-prev" data-prev aria-label="Previous page"><span>←</span></button><button class="page-hotspot page-hotspot-next" data-next aria-label="Next page"><span>→</span></button></div><div class="notebook-controls"><button class="control-button" data-prev aria-label="Previous page">← <span>prev</span></button><div class="page-dots" aria-label="Jump to a page">${pages.map((page, index) => `<button class="page-dot" data-jump="${index}" aria-label="Go to ${page.label} page"><span>${String(index + 1).padStart(2, "0")}</span></button>`).join("")}</div><button class="control-button" data-next aria-label="Next page"><span>next</span> →</button></div></main><div class="edit-mode-bar" data-edit-bar hidden><span><strong>edit mode</strong> tap any notebook text to change it</span><button data-edit-done>done editing</button></div></div>`;

const pageEl = document.querySelector<HTMLElement>("[data-page]")!;
const underPageEl = document.querySelector<HTMLElement>("[data-under-page]")!;
const dots = [...document.querySelectorAll<HTMLButtonElement>(".page-dot")];
const editBar = document.querySelector<HTMLElement>("[data-edit-bar]")!;
let isEditing = false;

const captureEditableCopy = () => {
  if (!isEditing) return;
  pageEl.querySelectorAll<HTMLElement>("[data-copy]").forEach((element) => {
    const key = element.dataset.copy as keyof Copy;
    copy[key] = element.innerText.trim();
  });
  localStorage.setItem("birthday-notebook-copy", JSON.stringify(copy));
};

const applyEditing = () => {
  const content = pageEl.querySelector<HTMLElement>(".page-content");
  if (!content) return;
  content.contentEditable = String(isEditing);
  content.spellcheck = true;
  content.classList.toggle("is-editable", isEditing);
};

const startEditing = () => {
  isEditing = true;
  editBar.hidden = false;
  editBar.classList.add("is-visible");
  applyEditing();
};

const finishEditing = () => {
  captureEditableCopy();
  isEditing = false;
  editBar.hidden = true;
  editBar.classList.remove("is-visible");
  applyEditing();
};

const renderCurrentPage = () => {
  pageEl.innerHTML = `<div class="page-content">${pages[currentPage].render()}</div>`;
  applyEditing();
  dots.forEach((dot, index) => dot.classList.toggle("active", index === currentPage));
  document.querySelectorAll<HTMLButtonElement>("[data-prev]").forEach((button) => { button.disabled = currentPage === 0; });
  document.querySelectorAll<HTMLButtonElement>("[data-next]").forEach((button) => { button.disabled = currentPage === pages.length - 1; });
};

const goToPage = (nextPage: number) => {
  if (isAnimating || nextPage < 0 || nextPage > pages.length - 1 || nextPage === currentPage) return;
  captureEditableCopy();
  isAnimating = true;
  const direction = nextPage > currentPage ? "forward" : "backward";
  underPageEl.innerHTML = `<div class="page-content">${pages[nextPage].render()}</div>`;
  pageEl.classList.add(`turn-away-${direction}`);
  window.setTimeout(() => {
    currentPage = nextPage;
    pageEl.innerHTML = underPageEl.innerHTML;
    underPageEl.innerHTML = "";
    pageEl.classList.remove(`turn-away-${direction}`);
    renderCurrentPage();
    isAnimating = false;
  }, 575);
};

document.querySelectorAll<HTMLButtonElement>("[data-next]").forEach((button) => button.addEventListener("click", () => goToPage(currentPage + 1)));
document.querySelectorAll<HTMLButtonElement>("[data-prev]").forEach((button) => button.addEventListener("click", () => goToPage(currentPage - 1)));
dots.forEach((dot) => dot.addEventListener("click", () => { if (dot.dataset.jump === "2") { pageThreeClicks += 1; if (pageThreeClicks > 5) startEditing(); } goToPage(Number(dot.dataset.jump)); }));
document.addEventListener("keydown", (event) => { if (event.key === "ArrowRight") goToPage(currentPage + 1); if (event.key === "ArrowLeft") goToPage(currentPage - 1); if (event.key === "Home") goToPage(0); if (event.key === "End") goToPage(pages.length - 1); });
document.querySelector<HTMLButtonElement>("[data-edit-done]")?.addEventListener("click", finishEditing);

renderCurrentPage();
