const tg = window.Telegram?.WebApp;
const APP_BASE_PATH = (() => {
    const path = window.location.pathname;
    if (!path || path === "/") return "";
    return path.endsWith("/") ? path.slice(0, -1) : path;
})();

function apiPath(path) {
    return `${APP_BASE_PATH}${path}`;
}

const state = {
    view: "dashboard",
    boot: null,
    selectedPlan: "quarter",
    onboardingStep: 0,
    files: { front: null, side: null },
    analysis: null,
    nutrition: null,
    mealType: "dinner",
    chat: [],
    settings: { gender: "male", age: 25, languageCode: "ru" }
};

const nav = [
    ["dashboard", "Профиль", "user-round"],
    ["features", "Все функции", "layout-grid"],
    ["battle", "MogBattle", "swords"],
    ["analysis", "Анализ лица", "scan-face"],
    ["plan", "Персональный план", "calendar-days"],
    ["gpt", "AscendGPT", "brain"],
    ["nutrition", "Питание", "utensils"],
    ["academy", "Академия", "graduation-cap"]
];

const onboarding = [
    {
        eyebrow: "60 дней",
        title: "Красота как система",
        text: "AscendLab собирает лицо, стиль, уход, питание и привычки в один понятный маршрут.",
        art: () => `<div class="days-ring"><div><strong>60</strong><span>days to ascend</span></div></div>`
    },
    {
        eyebrow: "Реальность знакомств",
        title: "Первые секунды решают слишком много",
        text: "Внешность не заменяет личность, но она меняет стартовую точку диалога.",
        art: () => `<div class="bar-chart">
            ${[8, 14, 24, 32, 48, 70, 92].map((h, i) => `<span class="bar" data-label="${40 + i * 10}%" style="height:${h}%"></span>`).join("")}
        </div>`
    },
    {
        eyebrow: "Эффект ореола",
        title: "Восприятие можно улучшать этично",
        text: "Мы фокусируемся на управляемых вещах: кожа, контур, фото, одежда, режим.",
        art: () => `<div class="halo-grid">
            <div class="halo-card good"><p class="eyebrow">Сильная подача</p><h3>чистый тон</h3><p class="muted">увереннее, свежее, собраннее</p></div>
            <div class="halo-card bad"><p class="eyebrow">Случайная подача</p><h3>шумный образ</h3><p class="muted">усталость, хаос, слабый контур</p></div>
        </div>`
    },
    {
        eyebrow: "Методы",
        title: "Выбирай маршрут без крайностей",
        text: "Натуральный уход, софтмаксинг, тело, стиль и эксперименты с фото под контролем AI.",
        art: () => `<div class="route-grid">${[
            ["activity", "Натуральный"],
            ["droplets", "Skincare"],
            ["scissors", "Стрижка"],
            ["sparkles", "Стиль"]
        ].map(([icon, label]) => `<div class="route-tile"><i data-lucide="${icon}"></i><span>${label}</span></div>`).join("")}</div>`
    },
    {
        eyebrow: "Сканирование",
        title: "Начни с фронтального фото",
        text: "Нейтральное выражение, хороший свет, камера на уровне глаз. Боковой ракурс усилит точность.",
        art: () => `<div class="lab-visual"><div class="scan-face"><span class="face-lines"></span></div></div>`
    },
    {
        eyebrow: "AscendGPT",
        title: "AI превращает оценку в план",
        text: "После анализа ассистент помогает с уходом, питанием, стрижкой, стилем и недельными действиями.",
        art: () => `<div class="story-art"><div class="chat-message assistant">Сначала стабилизируем базу: сон, вода, SPF, стрижка по контуру. Затем усилим стиль и фото.</div></div>`
    }
];

function initTelegram() {
    if (!tg) return;
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#f7fbff");
    tg.setBackgroundColor("#f7fbff");
    tg.setBottomBarColor("#f7fbff");
    if (tg.isVersionAtLeast?.("8.0")) {
        try { tg.requestFullscreen(); } catch (_) {}
    }
}

async function api(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": tg?.initData || "",
        ...(options.headers || {})
    };
    const response = await fetch(apiPath(path), { ...options, headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        throw new Error(data.message || "Ошибка запроса");
    }
    return data;
}

async function bootstrap() {
    renderLoading();
    try {
        state.boot = await api("/api/bootstrap", { method: "GET", headers: { "Content-Type": "application/json" } });
        state.settings = {
            gender: state.boot.user.gender || "male",
            age: state.boot.user.age || 25,
            languageCode: state.boot.user.languageCode || "ru"
        };
        state.selectedPlan = state.boot.plans.find(plan => plan.code === "quarter")?.code || state.boot.plans[0].code;
        renderNav();
        const seen = localStorage.getItem("ascendlab:onboarding");
        if (!seen) {
            state.view = "onboarding";
        }
        render();
    } catch (error) {
        document.querySelector("#app").innerHTML = `<section class="section-panel"><h2>Не удалось запустить AscendLab</h2><p class="muted">${escapeHtml(error.message)}</p></section>`;
    }
}

function renderLoading() {
    document.querySelector("#app").innerHTML = `<section class="section-panel"><div class="skeleton"></div><div style="height:12px"></div><div class="skeleton"></div></section>`;
}

function render() {
    const app = document.querySelector("#app");
    const view = {
        onboarding: renderOnboarding,
        dashboard: renderDashboard,
        features: renderFeatures,
        analysis: renderAnalysis,
        plan: renderPlan,
        gpt: renderGpt,
        nutrition: renderNutrition,
        academy: renderAcademy,
        battle: renderBattle
    }[state.view] || renderDashboard;
    app.innerHTML = `<div class="view">${view()}</div>`;
    bindView();
    refreshIcons();
}

function renderOnboarding() {
    const slide = onboarding[state.onboardingStep];
    return `<section class="hero-panel">
        <div class="story-progress">${onboarding.map((_, i) => `<span style="--progress:${i < state.onboardingStep ? 100 : i === state.onboardingStep ? 68 : 0}%"></span>`).join("")}</div>
        <button class="chip" data-action="skip-onboarding" style="justify-self:end">Пропустить</button>
        <div class="story-art">${slide.art()}</div>
        <div>
            <p class="eyebrow">${slide.eyebrow}</p>
            <h1>${slide.title}</h1>
            <p class="muted">${slide.text}</p>
        </div>
        <div class="grid two">
            <button class="button quiet" data-action="prev-onboarding" ${state.onboardingStep === 0 ? "disabled" : ""}><i data-lucide="chevron-left"></i>Назад</button>
            <button class="button primary" data-action="next-onboarding">${state.onboardingStep === onboarding.length - 1 ? "Начать" : "Далее"}<i data-lucide="chevron-right"></i></button>
        </div>
    </section>`;
}

function renderDashboard() {
    const { user, subscription } = state.boot;
    const active = subscription.active;
    return `<section class="hero-panel dashboard-hero">
        <div class="signal-board">
            <div class="status-strip">
                <span class="status-pill ${active ? "active" : ""}"><span class="dot"></span>${active ? "AscendPro активен" : "подписка не активна"}</span>
                <span class="mini-pill">ID ${user.telegramId}</span>
            </div>
            <div>
                <p class="eyebrow">Лаборатория внешности</p>
                <h1>${active ? "Продолжаем прокачку" : "Готов стать заметнее?"}</h1>
                <p class="muted">${active ? `Осталось ${subscription.daysLeft} дн. доступа. Следующий лучший шаг — обновить анализ и собрать план недели.` : "Начни с анализа лица, затем открой AscendGPT и персональный план на 60 дней."}</p>
            </div>
            <div class="grid two">
                <button class="button primary" data-view="analysis"><i data-lucide="scan-face"></i>Сделать анализ</button>
                <button class="button secondary" data-view="gpt"><i data-lucide="brain"></i>AscendGPT</button>
            </div>
        </div>
        <div class="lab-visual">
            <div class="scan-face"><span class="face-lines"></span></div>
        </div>
    </section>
    <section class="section-panel">
        <p class="eyebrow">Пульс Ascend</p>
        <h2>Система на сегодня</h2>
        ${metric("Кожа", 72)}
        ${metric("Сон", active ? 82 : 41)}
        ${metric("Стиль", 66)}
        ${metric("Питание", active ? 74 : 34)}
    </section>
    <section class="section-panel">
        <p class="eyebrow">Выбери тариф</p>
        <h2>Полный доступ ко всем функциям</h2>
        <div class="plan-list">${state.boot.plans.map(planCard).join("")}</div>
        <button class="button primary" data-action="open-payment"><i data-lucide="unlock"></i>Получить доступ</button>
    </section>
    <section class="section-panel">
        <p class="eyebrow">Быстрые функции</p>
        <div class="grid three">${state.boot.features.slice(0, 6).map(featureCard).join("")}</div>
    </section>`;
}

function renderFeatures() {
    return `<section class="section-panel">
        <p class="eyebrow">Все функции</p>
        <h1>14+ инструментов</h1>
        <p class="muted">Полный список того, что открывается в AscendPro. Раздел вакансий исключён.</p>
        <div class="grid three">${state.boot.features.map(featureCard).join("")}</div>
        <button class="button primary" data-action="open-payment"><i data-lucide="unlock"></i>Получить доступ</button>
    </section>`;
}

function renderAnalysis() {
    const result = state.analysis;
    return `<section class="section-panel">
        <p class="eyebrow">Анализ лица</p>
        <h1>Скан внешности</h1>
        <p class="muted">Загрузи фронтальное фото и, по желанию, боковой ракурс. AI не ставит диагнозы — он собирает эстетический план.</p>
        <div class="upload-grid">
            ${uploadTile("front", "Анфас", "хорошее освещение")}
            ${uploadTile("side", "Профиль", "по желанию")}
        </div>
        <button class="button primary" data-action="run-analysis"><i data-lucide="scan-line"></i>Оценить лицо</button>
    </section>
    ${result ? renderAnalysisResult(result) : ""}
    <section class="section-panel">
        <p class="eyebrow">Персональный план</p>
        <h2>${isPro() ? "Открыт" : "План закрыт"}</h2>
        <p class="muted">${isPro() ? "После анализа здесь появится 60-дневный маршрут по зонам." : "Персональный план доступен с AscendPro."}</p>
        <button class="button ${isPro() ? "secondary" : "primary"}" data-view="${isPro() ? "plan" : "dashboard"}">${isPro() ? "Открыть план" : "Получить доступ"}</button>
    </section>`;
}

function renderAnalysisResult(result) {
    const metrics = result.metrics || [];
    const zones = result.zones || [];
    return `<section class="section-panel">
        <p class="eyebrow">Результат</p>
        <h1>${result.score}<span style="font-size:.38em;color:var(--muted)"> / 100</span></h1>
        <p class="muted">${escapeHtml(result.summary || "")}</p>
        ${metrics.map(item => metric(item.name, item.value, item.hint)).join("")}
        <div class="zone-list">${zones.map(zone => `<div class="zone-card"><strong>${escapeHtml(zone.name)}<em>${escapeHtml(zone.status)}</em></strong><p class="muted">${escapeHtml(zone.advice)}</p></div>`).join("")}</div>
    </section>`;
}

function renderPlan() {
    if (!isPro()) {
        return `<section class="hero-panel">
            <p class="eyebrow">План закрыт</p>
            <h1>Персональный план</h1>
            <p class="muted">После оплаты AscendPro план превращает анализ лица в 60 дней действий: кожа, волосы, стиль, питание, сон, фото.</p>
            <button class="button primary" data-action="open-payment"><i data-lucide="lock-keyhole-open"></i>Получить доступ</button>
        </section>`;
    }
    return `<section class="section-panel">
        <p class="eyebrow">60 дней</p>
        <h1>Маршрут преображения</h1>
        <div class="timeline">
            ${[
                ["Дни 1-7", "Стабилизировать кожу, воду, сон и базовую подачу."],
                ["Дни 8-21", "Стрижка, форма бровей, цветовая палитра, контрольные фото."],
                ["Дни 22-45", "Тело, питание, гардеробные связки, социальная подача."],
                ["Дни 46-60", "Финальная полировка образа и новые фото для профилей."]
            ].map(([title, text]) => `<div class="timeline-step"><h3>${title}</h3><p class="muted">${text}</p></div>`).join("")}
        </div>
    </section>`;
}

function renderGpt() {
    if (state.chat.length === 0) {
        state.chat.push({ role: "assistant", text: "Привет. Я AscendGPT — AI-ассистент по внешности. Могу разобрать уход, стрижку, питание, стиль и план на неделю." });
    }
    return `<section class="section-panel chat-window">
        <div class="assistant-head">
            <span class="brand-mark">AI</span>
            <div><h3>AscendGPT</h3><p class="eyebrow" style="margin:0">на связи</p></div>
        </div>
        <div class="chat-list" id="chatList">${state.chat.map(message => `<div class="chat-message ${message.role}">${escapeHtml(message.text)}</div>`).join("")}</div>
        <div class="chips">${["Отёки", "С чего начать", "Питание", "План на неделю"].map(text => `<button class="chip" data-chat-chip="${text}">${text}</button>`).join("")}</div>
        <form class="composer" id="chatForm">
            <input id="chatInput" placeholder="Спроси что-нибудь..." autocomplete="off">
            <button class="button primary send-button" aria-label="Отправить"><i data-lucide="send"></i></button>
        </form>
    </section>`;
}

function renderNutrition() {
    const data = state.nutrition || { calories: 0, targetCalories: 2200, protein: 0, fat: 0, carbs: 0, logs: [] };
    return `<section class="section-panel">
        <p class="eyebrow">Питание</p>
        <h1>Дневник КБЖУ</h1>
        <p class="muted">Считай калории и макросы, получай AI-советы по рациону.</p>
        <div class="nutrition-ring"><div><strong>${data.calories}</strong><span class="muted"> / ${data.targetCalories} ккал</span></div></div>
        ${metric("Белки", pct(data.protein, 150), `${data.protein} г`)}
        ${metric("Жиры", pct(data.fat, 70), `${data.fat} г`)}
        ${metric("Углеводы", pct(data.carbs, 250), `${data.carbs} г`)}
        <div class="water-buttons">
            <button class="button quiet">+250</button>
            <button class="button quiet">+500</button>
            <button class="button quiet">+1 л</button>
        </div>
    </section>
    <section class="section-panel">
        <h2>Добавить приём пищи</h2>
        <div class="meal-controls">
            <div class="segmented" id="mealType">${["breakfast:Завтрак","lunch:Обед","dinner:Ужин","snack:Перекус"].map(pair => {
                const [value, label] = pair.split(":");
                return `<button data-value="${value}" class="${state.mealType === value ? "active" : ""}">${label}</button>`;
            }).join("")}</div>
            <input class="meal-input" id="mealInput" placeholder="Напр.: 2 яйца, тост с авокадо">
            <button class="button primary" data-action="add-meal"><i data-lucide="wand-sparkles"></i>Оценить и добавить</button>
            <div class="zone-list">${(data.logs || []).map(log => `<div class="zone-card"><strong>${escapeHtml(log.title)}<em>${log.calories} ккал</em></strong><p class="muted">Б ${log.protein} · Ж ${log.fat} · У ${log.carbs}</p></div>`).join("")}</div>
        </div>
    </section>`;
}

function renderAcademy() {
    const guides = [
        ["Softmaxxing", "Кожа", "База ухода без хаоса и лишних активов."],
        ["Softmaxxing", "Фото и подача", "Свет, ракурс, выражение и профильные фото."],
        ["Softmaxxing", "Волосы", "Контур, длина, плотность и общение с мастером."],
        ["Hardmaxxing", "Тело", "Силовой минимум, питание, осанка и силуэт."]
    ];
    return `<section class="section-panel">
        <p class="eyebrow">Академия</p>
        <h1>Гайды</h1>
        <p class="muted">База знаний по внешности: уход, стиль, тренировки, питание.</p>
        <div class="grid two">${guides.map(([tag, title, text]) => `<div class="guide-card"><span class="badge">${tag}</span><h3>${title}</h3><small>${text}</small><button class="button secondary">Смотреть гайд</button></div>`).join("")}</div>
    </section>`;
}

function renderBattle() {
    return `<section class="section-panel battle-arena">
        <p class="eyebrow">MogBattle</p>
        <h1>MogBattle</h1>
        <p class="muted">Сравни свой результат с другим игроком и узнай, кто сильнее в баттле. Для честного боя сначала нужен анализ.</p>
        <div class="battle-stats">
            <div class="battle-stat"><small>ELO</small><strong>800</strong></div>
            <div class="battle-stat"><small>Ранг</small><strong>Mog C</strong></div>
            <div class="battle-stat"><small>Winrate</small><strong>0%</strong></div>
        </div>
        <button class="button primary" data-view="analysis"><i data-lucide="scan-face"></i>Сделать анализ лица</button>
        <div class="grid two">
            <button class="button secondary">Топ 30 по ELO</button>
            <button class="button secondary">История боёв</button>
        </div>
    </section>`;
}

function metric(name, value, hint = "") {
    const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
    return `<div class="metric-row"><strong>${escapeHtml(name)}</strong><div class="track"><span class="fill" style="width:${safeValue}%"></span></div><span>${escapeHtml(String(hint || safeValue))}</span></div>`;
}

function featureCard(feature) {
    const hot = ["gpt", "body", "battle"].includes(feature.id);
    return `<button class="feature-card ${hot ? "is-hot" : ""}" data-view="${viewForFeature(feature.id)}">
        <span class="icon-shell"><i data-lucide="${feature.icon}"></i></span>
        <span><strong>${feature.title}</strong><small>${feature.subtitle}</small></span>
    </button>`;
}

function planCard(plan) {
    const selected = state.selectedPlan === plan.code;
    return `<button class="plan-card ${selected ? "selected" : ""}" data-plan="${plan.code}">
        <span><strong>${plan.title}</strong><small>${plan.subtitle}</small>${plan.badge ? `<span class="badge">${plan.badge}</span>` : ""}</span>
        <span class="price">${plan.rub} ₽</span>
    </button>`;
}

function uploadTile(kind, title, subtitle) {
    const file = state.files[kind];
    return `<label class="upload-tile ${file ? "has-file" : ""}">
        <input type="file" accept="image/png,image/jpeg" data-file="${kind}">
        <span>
            <span class="upload-icon"><i data-lucide="${kind === "front" ? "camera" : "scan"}"></i></span>
            <h3>${file ? escapeHtml(file.name) : title}</h3>
            <small class="muted">${subtitle}</small>
        </span>
    </label>`;
}

function viewForFeature(id) {
    if (id === "face") return "analysis";
    if (id === "gpt") return "gpt";
    if (id === "food") return "nutrition";
    if (id === "academy") return "academy";
    if (id === "battle") return "battle";
    return "features";
}

function bindView() {
    document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
    document.querySelectorAll("[data-plan]").forEach(button => button.addEventListener("click", () => {
        state.selectedPlan = button.dataset.plan;
        render();
    }));
    document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", handleAction));
    document.querySelectorAll("[data-file]").forEach(input => input.addEventListener("change", event => {
        state.files[input.dataset.file] = event.target.files[0] || null;
        render();
    }));
    document.querySelectorAll("[data-chat-chip]").forEach(button => button.addEventListener("click", () => sendChat(button.dataset.chatChip)));
    document.querySelector("#chatForm")?.addEventListener("submit", event => {
        event.preventDefault();
        const input = document.querySelector("#chatInput");
        sendChat(input.value);
        input.value = "";
    });
    document.querySelector("#mealType")?.addEventListener("click", event => {
        const button = event.target.closest("button[data-value]");
        if (!button) return;
        state.mealType = button.dataset.value;
        render();
    });
}

async function handleAction(event) {
    const action = event.currentTarget.dataset.action;
    if (action === "skip-onboarding") {
        finishOnboarding();
    }
    if (action === "prev-onboarding") {
        state.onboardingStep = Math.max(0, state.onboardingStep - 1);
        render();
    }
    if (action === "next-onboarding") {
        if (state.onboardingStep === onboarding.length - 1) finishOnboarding();
        else {
            state.onboardingStep += 1;
            render();
        }
    }
    if (action === "open-payment") {
        openPayment();
    }
    if (action === "run-analysis") {
        await runAnalysis();
    }
    if (action === "add-meal") {
        await addMeal();
    }
}

function finishOnboarding() {
    localStorage.setItem("ascendlab:onboarding", "1");
    setView("dashboard");
}

function setView(view) {
    state.view = view;
    closeDrawer();
    renderNav();
    render();
    if (view === "nutrition") loadNutrition();
}

function renderNav() {
    const navRoot = document.querySelector("#drawerNav");
    navRoot.innerHTML = nav.map(([view, label, icon]) => `<button class="nav-item ${state.view === view ? "active" : ""}" data-nav="${view}"><i data-lucide="${icon}"></i><span>${label}</span></button>`).join("");
    navRoot.querySelectorAll("[data-nav]").forEach(button => button.addEventListener("click", () => setView(button.dataset.nav)));
    refreshIcons();
}

async function runAnalysis() {
    const form = new FormData();
    if (state.files.front) form.append("front", state.files.front);
    if (state.files.side) form.append("side", state.files.side);
    if (!state.files.front && !state.files.side) {
        toast("Добавь хотя бы одно фото.");
        return;
    }
    try {
        toast("Сканирую фото...");
        const response = await fetch(apiPath("/api/analysis"), {
            method: "POST",
            headers: { "X-Telegram-Init-Data": tg?.initData || "" },
            body: form
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Не удалось провести анализ");
        state.analysis = data;
        render();
        toast("Анализ готов.");
    } catch (error) {
        toast(error.message);
    }
}

async function sendChat(text) {
    const message = (text || "").trim();
    if (!message) return;
    state.chat.push({ role: "user", text: message });
    const assistant = { role: "assistant", text: "" };
    state.chat.push(assistant);
    render();
    try {
        const response = await fetch(apiPath("/api/chat/stream"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Telegram-Init-Data": tg?.initData || ""
            },
            body: JSON.stringify({ message })
        });
        if (!response.ok || !response.body) {
            const error = await response.json().catch(() => ({ message: "Ошибка чата" }));
            throw new Error(error.message);
        }
        await readSse(response, delta => {
            assistant.text += delta;
            render();
            const list = document.querySelector("#chatList");
            if (list) list.scrollTop = list.scrollHeight;
        });
    } catch (error) {
        assistant.text = error.message;
        render();
    }
}

async function readSse(response, onDelta) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const dataLine = block.split("\n").find(line => line.startsWith("data:"));
            if (!dataLine) continue;
            const payload = JSON.parse(dataLine.slice(5).trim());
            if (payload.text) onDelta(payload.text);
        }
    }
}

async function loadNutrition() {
    try {
        state.nutrition = await api("/api/nutrition", { method: "GET" });
        if (state.view === "nutrition") render();
    } catch (error) {
        toast(error.message);
    }
}

async function addMeal() {
    const input = document.querySelector("#mealInput");
    const text = input?.value?.trim();
    if (!text) {
        toast("Опиши приём пищи.");
        return;
    }
    try {
        state.nutrition = await api("/api/nutrition", {
            method: "POST",
            body: JSON.stringify({ mealType: state.mealType, text })
        });
        render();
        toast("Добавлено в дневник.");
    } catch (error) {
        toast(error.message);
    }
}

function openPayment() {
    const plan = selectedPlan();
    document.querySelector("#paymentTitle").textContent = plan.title;
    document.querySelector("#paymentSubtitle").textContent = `${plan.subtitle}. ${plan.rub} ₽ · ${plan.stars} Stars · ${plan.usd} USDT`;
    document.querySelector("#paymentPlanSummary").innerHTML = `<button class="plan-card selected"><span><strong>${plan.title}</strong><small>${plan.subtitle}</small></span><span class="price">${plan.rub} ₽</span></button>`;
    const config = state.boot.payments;
    document.querySelector("[data-provider='stars']").disabled = !config.telegramStars;
    document.querySelector("[data-provider='crypto']").disabled = !config.cryptoPay;
    document.querySelector("[data-provider='card']").disabled = !config.card;
    document.querySelector("#demoActivateButton").style.display = config.demoMode ? "inline-flex" : "none";
    openModal("paymentModal");
}

async function pay(provider) {
    const endpoint = { stars: "stars", crypto: "crypto", card: "card" }[provider];
    const plan = selectedPlan();
    try {
        const link = await api(`/api/payments/${endpoint}`, {
            method: "POST",
            body: JSON.stringify({ planCode: plan.code })
        });
        if (link.action === "open_invoice" && tg?.openInvoice) {
            tg.openInvoice(link.url, status => {
                toast(status === "paid" ? "Оплата прошла." : "Счёт закрыт: " + status);
                bootstrap();
            });
        } else if (link.action === "open_telegram_link" && tg?.openTelegramLink) {
            tg.openTelegramLink(link.url);
        } else if (tg?.openLink) {
            tg.openLink(link.url);
        } else {
            window.open(link.url, "_blank", "noopener");
        }
    } catch (error) {
        toast(error.message);
    }
}

async function activateDemo() {
    try {
        await api("/api/payments/demo/activate", {
            method: "POST",
            body: JSON.stringify({ planCode: selectedPlan().code })
        });
        closeModals();
        await bootstrap();
        toast("Демо-доступ активирован.");
    } catch (error) {
        toast(error.message);
    }
}

function selectedPlan() {
    return state.boot.plans.find(plan => plan.code === state.selectedPlan) || state.boot.plans[0];
}

function isPro() {
    return Boolean(state.boot?.subscription?.active);
}

function pct(value, target) {
    return Math.round(Math.max(0, Math.min(100, (value / target) * 100)));
}

function openModal(id) {
    document.querySelector(`#${id}`).classList.add("open");
    document.querySelector(`#${id}`).setAttribute("aria-hidden", "false");
    refreshIcons();
}

function closeModals() {
    document.querySelectorAll(".modal-layer").forEach(layer => {
        layer.classList.remove("open");
        layer.setAttribute("aria-hidden", "true");
    });
}

function openDrawer() {
    document.querySelector("#drawer").classList.add("open");
    document.querySelector("#drawer").setAttribute("aria-hidden", "false");
    document.querySelector("#scrim").classList.add("open");
}

function closeDrawer() {
    document.querySelector("#drawer").classList.remove("open");
    document.querySelector("#drawer").setAttribute("aria-hidden", "true");
    document.querySelector("#scrim").classList.remove("open");
}

function bindGlobal() {
    document.querySelector("#menuButton").addEventListener("click", openDrawer);
    document.querySelector("#closeDrawer").addEventListener("click", closeDrawer);
    document.querySelector("#scrim").addEventListener("click", closeDrawer);
    document.querySelector("#brandButton").addEventListener("click", () => setView("dashboard"));
    document.querySelector("#settingsButton").addEventListener("click", () => {
        document.querySelector("#ageInput").value = state.settings.age;
        updateSettingButtons("gender", state.settings.gender);
        updateSettingButtons("languageCode", state.settings.languageCode);
        openModal("settingsModal");
    });
    document.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", closeModals));
    document.querySelector("#paymentModal").addEventListener("click", event => {
        const method = event.target.closest("[data-provider]");
        if (method && !method.disabled) pay(method.dataset.provider);
        if (event.target.id === "paymentModal") closeModals();
    });
    document.querySelector("#settingsModal").addEventListener("click", event => {
        const button = event.target.closest(".segmented button[data-value]");
        if (!button) return;
        const group = button.closest(".segmented").dataset.setting;
        state.settings[group] = button.dataset.value;
        updateSettingButtons(group, button.dataset.value);
    });
    document.querySelector("#saveSettingsButton").addEventListener("click", saveSettings);
    document.querySelector("#demoActivateButton").addEventListener("click", activateDemo);
}

async function saveSettings() {
    state.settings.age = Number(document.querySelector("#ageInput").value || 25);
    try {
        state.boot = await api("/api/settings", {
            method: "PATCH",
            body: JSON.stringify(state.settings)
        });
        closeModals();
        render();
        toast("Настройки сохранены.");
    } catch (error) {
        toast(error.message);
    }
}

function updateSettingButtons(group, value) {
    document.querySelectorAll(`.segmented[data-setting="${group}"] button`).forEach(button => {
        button.classList.toggle("active", button.dataset.value === value);
    });
}

function toast(message) {
    const node = document.querySelector("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 3200);
}

function refreshIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

initTelegram();
bindGlobal();
bootstrap();
