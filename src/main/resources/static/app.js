const tg = window.Telegram?.WebApp;
const APP_BASE_PATH = (() => {
    const path = window.location.pathname;
    if (!path || path === "/") return "";
    return path.endsWith("/") ? path.slice(0, -1) : path;
})();
const ONBOARDING_KEY = "bodylab:onboarding";
const LEGACY_ONBOARDING_KEY = "ascendlab:onboarding";
const MAX_CHAT_MESSAGES = 28;
const CHAT_CONTEXT_MESSAGES = 8;
const CHAT_TYPE_DELAY = 22;
const CHAT_RENDER_INTERVAL = 42;
const CHAT_PUNCTUATION_DELAY = 72;
const BODYGPT_DAILY_LIMIT = 100;
const BODYLAB_DAY_SHIFT_MS = 60 * 60 * 1000;
const PHOTO_ANALYSIS_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const BODY_ANALYSIS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
let planClockTimer = null;
let chatScrollFrame = null;
let countdownTimer = null;

function apiPath(path) {
    return `${APP_BASE_PATH}${path}`;
}

const state = {
    view: "dashboard",
    boot: null,
    selectedPlan: "intro",
    onboardingStep: 0,
    files: { front: null, side: null, body: null },
    previews: { front: null, side: null, body: null },
    analysis: null,
    nutrition: null,
    nutritionHistory: null,
    nutritionHistoryOpen: false,
    admin: null,
    chatUsage: { limit: BODYGPT_DAILY_LIMIT, used: 0, remaining: BODYGPT_DAILY_LIMIT },
    accessNotice: null,
    pendingAccessPlan: null,
    busy: { analysis: false, body: false, meal: false, chat: false, payment: false, battle: false, tool: "" },
    planReports: {},
    selectedPlanDay: null,
    selectedGuide: null,
    selectedGuideCategory: "",
    guideTrack: "soft",
    analysisStep: 1,
    planTools: [],
    water: { enabled: false, amountMl: 0, targetMl: 2500, dayKey: "" },
    bodyProfile: null,
    bodyAnalysis: null,
    bodyHistory: [],
    analysisHistory: [],
    toolReports: {},
    toolHistory: {},
    battleOpponent: "neo",
    battleResult: null,
    battleHistory: [],
    mealType: "dinner",
    chat: [],
    settings: { gender: "male", age: 25, languageCode: "ru" }
};

const planPhases = [
    {
        from: 1,
        to: 7,
        title: "База и привычки",
        accent: "Стабилизировать кожу, сон, воду и контрольные фото.",
        tasks: ["Утренний уход: очищение, увлажнение, SPF", "2 литра воды или личная норма", "Сон 7+ часов", "Контрольное фото при дневном свете"]
    },
    {
        from: 8,
        to: 21,
        title: "Контур и подача",
        accent: "Стрижка, брови, осанка, свет и выражение лица.",
        tasks: ["Проверить контур стрижки у висков", "10 минут осанки и шеи", "Три фото с разным светом", "Выбрать 2 цвета, которые освежают лицо"]
    },
    {
        from: 22,
        to: 45,
        title: "Тело и стиль",
        accent: "Закрепить питание, силуэт, гардеробные связки и ритм.",
        tasks: ["Белок в каждом основном приёме пищи", "Тренировка или 8000 шагов", "Один собранный образ без случайных вещей", "Отметить, что реально улучшило внешний вид"]
    },
    {
        from: 46,
        to: 60,
        title: "Финальная полировка",
        accent: "Собрать лучший образ, обновить фото и закрепить систему.",
        tasks: ["Повторить фото из первого дня", "Обновить стрижку или укладку", "Выбрать лучший профильный снимок", "Записать правило, которое оставляем дальше"]
    }
];

const battleOpponents = [
    { id: "neo", name: "Артём", tier: "сильная внешность", score: 86, image: "assets/battle/fake-neo.jpg" },
    { id: "soft", name: "Никита", tier: "ровный образ", score: 63, image: "assets/battle/fake-soft.jpg" },
    { id: "raw", name: "Илья", tier: "слабый ракурс", score: 49, image: "assets/battle/fake-raw.jpg" }
];

const nav = [
    ["dashboard", "Профиль", "user-round"],
    ["features", "Все функции", "layout-grid"],
    ["battle", "MogBattle", "swords"],
    ["analysis", "Анализ лица", "scan-face"],
    ["body", "Body Max", "activity"],
    ["plan", "Персональный план", "calendar-days"],
    ["gpt", "BodyGPT", "brain"],
    ["nutrition", "Питание", "utensils"],
    ["academy", "Академия", "graduation-cap"]
];

const adminNavItem = ["admin", "Админка", "shield-check"];

const toolWorkspaces = {
    skin: {
        eyebrow: "Skincare",
        title: "Уход за кожей",
        text: "Собери утро и вечер без лишних активов. BodyLab держит фокус на барьере, SPF, очищении и стабильности.",
        icon: "droplets",
        uploadTitle: "Фото кожи",
        uploadSubtitle: "лицо крупно, мягкий свет",
        emptyText: "После фото BodyLab оценит тон, текстуру и зоны ухода.",
        metrics: [["Барьер", 68], ["SPF", 82], ["Регулярность", 54]],
        tasks: ["Утро: очищение, увлажнение, SPF.", "Вечер: очищение и восстановление.", "Новый актив вводить не чаще одного раза в 10 дней."]
    },
    hair: {
        eyebrow: "Стрижка",
        title: "Контур и волосы",
        text: "Проверь виски, затылок, объём сверху и то, как волосы поддерживают форму лица.",
        icon: "scissors",
        uploadTitle: "Фото волос",
        uploadSubtitle: "спереди или 3/4",
        emptyText: "После фото появится оценка контура, объёма и формы.",
        metrics: [["Контур", 61], ["Объём", 73], ["Форма", 66]],
        tasks: ["Сделай фото волос спереди и сбоку.", "Отметь, где контур выглядит тяжёлым.", "Подготовь 2 референса для мастера."]
    },
    sleep: {
        eyebrow: "Sleep Max",
        title: "Сон и восстановление",
        text: "Сон напрямую влияет на отёки, кожу, настроение, голод и качество тренировок.",
        icon: "moon",
        uploadTitle: "Утреннее фото",
        uploadSubtitle: "без фильтров",
        emptyText: "После фото появится оценка свежести лица, отёков и режима.",
        metrics: [["Режим", 58], ["Глубина", 64], ["Утренний вид", 52]],
        tasks: ["Лечь в один и тот же коридор времени.", "За 60 минут убрать яркий экран.", "Утром отметить отёки и энергию."]
    },
    water: {
        eyebrow: "Вода",
        title: "Гидратация",
        text: "Вода нужна не для магии, а для стабильной кожи, тренировок и контроля аппетита.",
        icon: "waves",
        uploadTitle: "Фото лица",
        uploadSubtitle: "утро или дневной свет",
        emptyText: "После фото появится оценка свежести, отёков и стабильности кожи.",
        metrics: [["Норма", 44], ["Соль", 63], ["Отёки", 57]],
        tasks: ["Начни с 500 мл в первой половине дня.", "Разнеси воду равномерно.", "Отметь солёную еду вечером."]
    },
    style: {
        eyebrow: "Стиль",
        title: "Style Guide",
        text: "Силуэт, посадка и цвета могут усилить внешность быстрее, чем случайные покупки.",
        icon: "sparkles",
        uploadTitle: "Фото образа",
        uploadSubtitle: "полный рост или зеркало",
        emptyText: "После фото появится оценка посадки, цвета и силуэта.",
        metrics: [["Посадка", 69], ["Цвета", 62], ["Силуэт", 71]],
        tasks: ["Выбери один чистый базовый образ.", "Убери вещь, которая ломает силуэт.", "Сфотографируй образ при дневном свете."]
    },
    photo: {
        eyebrow: "Фото-профиль",
        title: "Свет и ракурсы",
        text: "Профильное фото выигрывает не фильтрами, а высотой камеры, светом и выражением лица.",
        icon: "aperture",
        uploadTitle: "Профильное фото",
        uploadSubtitle: "как для аватарки",
        emptyText: "После фото появится оценка света, ракурса и выражения.",
        metrics: [["Свет", 74], ["Ракурс", 59], ["Выражение", 67]],
        tasks: ["Камера на уровне глаз.", "Свет из окна под углом 30-45 градусов.", "Сделай серию из 12 кадров, выбери 2."]
    },
    wardrobe: {
        eyebrow: "Гардероб",
        title: "Силуэт и цвета",
        text: "Гардероб должен работать на форму тела и контраст лица, а не просто быть набором вещей.",
        icon: "shirt",
        uploadTitle: "Фото в одежде",
        uploadSubtitle: "полный образ",
        emptyText: "После фото появится оценка базы, сочетаний и акцентов.",
        metrics: [["База", 57], ["Комбинации", 48], ["Акценты", 62]],
        tasks: ["Собери 3 связки верх-низ-обувь.", "Отложи вещи с плохой посадкой.", "Добавь один цветовой акцент."]
    },
    looks: {
        eyebrow: "Looks Like",
        title: "Похож на",
        text: "Сравнивай не “на кого похож”, а какие черты подачи можно усилить: волосы, свет, стиль, выражение.",
        icon: "user-search",
        uploadTitle: "Фото лица",
        uploadSubtitle: "лицо и стиль в кадре",
        emptyText: "После фото BodyLab подберёт архетип подачи и зоны усиления.",
        metrics: [["Архетип", 65], ["Подача", 58], ["Фото", 71]],
        tasks: ["Выбери 2 референса внешности.", "Разбери, что можно повторить без копирования.", "Сохрани идеи в план дня."]
    }
};

const guideCategories = [
    { id: "skin", track: "soft", tag: "Softmaxxing", title: "Кожа", icon: "droplets" },
    { id: "hair", track: "soft", tag: "Softmaxxing", title: "Волосы", icon: "scissors" },
    { id: "brows", track: "soft", tag: "Softmaxxing", title: "Брови", icon: "scan-eye" },
    { id: "style", track: "soft", tag: "Softmaxxing", title: "Стиль", icon: "sparkles" },
    { id: "posture", track: "soft", tag: "Softmaxxing", title: "Осанка", icon: "activity" },
    { id: "photo", track: "soft", tag: "Softmaxxing", title: "Фото", icon: "aperture" },
    { id: "jaw", track: "hard", tag: "Hardmaxxing", title: "Жевательные мышцы", icon: "circle-dot" },
    { id: "ortho", track: "hard", tag: "Hardmaxxing", title: "Ортодонтия", icon: "smile" },
    { id: "bite", track: "hard", tag: "Hardmaxxing", title: "Прикус", icon: "scan-line" },
    { id: "operations", track: "hard", tag: "Hardmaxxing", title: "Операции", icon: "shield-alert" },
    { id: "implants", track: "hard", tag: "Hardmaxxing", title: "Импланты", icon: "badge-plus" },
    { id: "body", track: "hard", tag: "Hardmaxxing", title: "Тело", icon: "dumbbell" }
];

const guideSeeds = {
    skin: ["Автозагар", "Акне", "Акнекутан: что важно знать", "Диета и кожа", "SPF без жирного блеска", "Постакне и тон", "Очищение без скрипа", "Увлажнение", "Ретиноиды: старт", "Кислоты", "Бритьё и раздражение", "Отёки утром", "Губы и барьер", "Минимальная рутина"],
    hair: ["Форма стрижки", "Виски и затылок", "Объём сверху", "Укладка без грязного блеска", "Подбор мастера", "Борода и щетина", "Линия роста", "Сушка волос", "Референсы для барбера"],
    brows: ["Форма бровей", "Плотность", "Симметрия", "Цвет и контраст", "Укладка", "Ошибки коррекции", "Брови и взгляд", "Мини-протокол"],
    style: ["Силуэт", "Цвета у лица", "Капсула на 30 дней"],
    posture: ["Шея вперёд", "Плечи", "Лопатки", "Таз и поясница", "Походка", "Фото осанки", "Ежедневный комплекс"],
    photo: ["Свет", "Ракурс", "Выражение", "Аватарка", "Фото для знакомств", "Разбор серии"],
    jaw: ["Жевательные мышцы: трезвый подход"],
    ortho: ["Брекеты и элайнеры", "Консультация ортодонта"],
    bite: ["Прикус и профиль", "Когда идти к специалисту"],
    operations: ["Ринопластика", "Блефаропластика", "Подбородок", "Скулы", "Липосакция лица", "Риски операций", "Как готовить вопросы врачу"],
    implants: ["Подбородочный имплант", "Скуловые импланты"],
    body: ["Набор массы", "Похудение", "Рекомпозиция", "Плечи и спина", "Талия и пресс"]
};

const guideLibrary = buildGuideLibrary();

const onboarding = [
    {
        eyebrow: "60 дней",
        title: "Красота как система",
        text: "BodyLab собирает лицо, стиль, уход, питание и привычки в один понятный маршрут.",
        art: () => `<div class="days-ring"><div><strong>60</strong><span>дней системы</span></div></div>`
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
        eyebrow: "BodyGPT",
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
    try { tg.BackButton?.hide?.(); } catch (_) {}
    try { tg.SettingsButton?.hide?.(); } catch (_) {}
    // Fullscreen makes Telegram render native close/menu controls over the app.
    // Expanded mode keeps the Mini App tall while preserving a separate Telegram header.
    if (tg.isFullscreen && tg.isVersionAtLeast?.("8.0")) {
        try { tg.exitFullscreen(); } catch (_) {}
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
        loadLocalState();
        state.chatUsage = state.boot.chatUsage || state.chatUsage;
        ensurePlanStartKey();
        state.selectedPlan = preferredPlanCode();
        renderNav();
        const seen = Boolean(state.boot.onboardingSeen || localStorage.getItem(ONBOARDING_KEY) || localStorage.getItem(LEGACY_ONBOARDING_KEY));
        if (!seen) {
            state.view = "onboarding";
        } else if (!state.boot.onboardingSeen) {
            completeOnboardingRemote();
        }
        const returnPlan = showReturnPaymentNotice();
        render();
        startPlanClock();
        startCountdownClock();
        if (returnPlan) openAccessModal(returnPlan);
    } catch (error) {
        document.querySelector("#app").innerHTML = `<section class="section-panel"><h2>Не удалось запустить BodyLab</h2><p class="muted">${escapeHtml(error.message)}</p></section>`;
    }
}

function renderLoading() {
    document.querySelector("#app").innerHTML = `<section class="section-panel"><div class="skeleton"></div><div style="height:12px"></div><div class="skeleton"></div></section>`;
}

function render() {
    const app = document.querySelector("#app");
    document.body.classList.toggle("is-onboarding", state.view === "onboarding");
    document.body.classList.toggle("is-chat", state.view === "gpt");
    const view = {
        onboarding: renderOnboarding,
        dashboard: renderDashboard,
        features: renderFeatures,
        analysis: renderAnalysis,
        body: renderBodyMax,
        plan: renderPlan,
        gpt: renderGpt,
        nutrition: renderNutrition,
        academy: renderAcademy,
        battle: renderBattle,
        admin: renderAdmin,
        skin: () => renderToolWorkspace("skin"),
        hair: () => renderToolWorkspace("hair"),
        sleep: () => renderToolWorkspace("sleep"),
        water: () => renderToolWorkspace("water"),
        style: () => renderToolWorkspace("style"),
        photo: () => renderToolWorkspace("photo"),
        wardrobe: () => renderToolWorkspace("wardrobe"),
        looks: () => renderToolWorkspace("looks")
    }[state.view] || renderDashboard;
    app.innerHTML = `<div class="view ${state.view === "onboarding" ? "onboarding-view" : ""}">${view()}</div>`;
    bindView();
    refreshIcons();
}

function renderOnboarding() {
    const slide = onboarding[state.onboardingStep];
    return `<section class="hero-panel onboarding-panel">
        <div class="story-progress">${onboarding.map((_, i) => `<span style="--progress:${i < state.onboardingStep ? 100 : i === state.onboardingStep ? 68 : 0}%"></span>`).join("")}</div>
        <button class="chip onboarding-skip" data-action="skip-onboarding">Пропустить</button>
        <div class="story-art">${slide.art()}</div>
        <div class="onboarding-copy">
            <p class="eyebrow">${slide.eyebrow}</p>
            <h1>${slide.title}</h1>
            <p class="muted">${slide.text}</p>
        </div>
        <div class="grid two onboarding-actions ${state.onboardingStep === 0 ? "single" : ""}">
            ${state.onboardingStep === 0 ? "" : `<button class="button quiet" data-action="prev-onboarding"><i data-lucide="chevron-left"></i>Назад</button>`}
            <button class="button primary" data-action="next-onboarding">${state.onboardingStep === onboarding.length - 1 ? "Начать" : "Далее"}<i data-lucide="chevron-right"></i></button>
        </div>
    </section>`;
}

function renderDashboard() {
    const { user, subscription } = state.boot;
    const active = subscription.active;
    const today = currentPlanDay();
    const phase = planPhase(today);
    const nextTasks = phase.tasks.slice(0, 3);
    return `${state.accessNotice ? renderAccessNotice() : ""}
    <section class="hero-panel dashboard-hero">
        <div class="signal-board">
            <div class="status-strip">
                <span class="status-pill ${active ? "active" : ""}"><span class="dot"></span>${active ? "BodyPro активен" : "подписка не активна"}</span>
                <span class="mini-pill">ID ${user.telegramId}</span>
            </div>
            <div>
                <p class="eyebrow">Лаборатория внешности</p>
                <h1>${active ? "Продолжаем прокачку" : "Готов стать заметнее?"}</h1>
                <p class="muted">${active ? `День ${today} из 60. Фокус: ${phase.accent}` : "Начни с анализа лица, затем открой BodyGPT и персональный план на 60 дней."}</p>
            </div>
            <div class="grid two">
                <button class="button primary" data-view="analysis"><i data-lucide="scan-face"></i>Сделать анализ</button>
                <button class="button secondary" data-view="${active ? "plan" : "gpt"}"><i data-lucide="${active ? "calendar-check" : "brain"}"></i>${active ? "День маршрута" : "BodyGPT"}</button>
            </div>
        </div>
        <div class="lab-visual">
            <div class="scan-face"><span class="face-lines"></span></div>
        </div>
    </section>
    ${active ? `<section class="section-panel today-guide">
        <p class="eyebrow">Что делать сейчас</p>
        <h2>Твой день ${today}</h2>
        <div class="today-task-list">${nextTasks.map(task => `<div><i data-lucide="check-circle-2"></i><span>${escapeHtml(task)}</span></div>`).join("")}</div>
        <div class="grid two">
            <button class="button primary" data-view="plan"><i data-lucide="route"></i>Открыть маршрут</button>
            <button class="button secondary" data-view="gpt"><i data-lucide="brain"></i>Спросить BodyGPT</button>
        </div>
    </section>` : ""}
    <section class="section-panel">
        <p class="eyebrow">Пульс BodyLab</p>
        <h2>Пульс дня</h2>
        ${metric("Кожа", 72)}
        ${metric("Сон", active ? 82 : 41)}
        ${metric("Стиль", 66)}
        ${metric("Питание", active ? 74 : 34)}
    </section>
    ${active ? "" : `<section class="section-panel">
        <p class="eyebrow">Выбери тариф</p>
        <h2>Полный доступ ко всем функциям</h2>
        <div class="plan-list">${state.boot.plans.map(planCard).join("")}</div>
        <button class="button primary" data-action="open-payment"><i data-lucide="unlock"></i>Получить доступ</button>
    </section>`}
    <section class="section-panel">
        <p class="eyebrow">Быстрые функции</p>
        <div class="grid three">${state.boot.features.slice(0, 6).map(featureCard).join("")}</div>
    </section>`;
}

function renderAccessNotice() {
    return `<section class="section-panel access-notice">
        <div>
            <p class="eyebrow">Доступ открыт</p>
            <h2>BodyPro активирован</h2>
            <p class="muted">${escapeHtml(state.accessNotice)}</p>
        </div>
        <button class="button secondary" data-action="dismiss-access-notice"><i data-lucide="check"></i>Понятно</button>
    </section>`;
}

function renderFeatures() {
    return `<section class="section-panel">
        <p class="eyebrow">Все функции</p>
        <h1>14 инструментов</h1>
        <p class="muted">Полный список того, что открывается в BodyPro.</p>
        <div class="grid three">${state.boot.features.map(featureCard).join("")}</div>
        ${isPro()
            ? `<button class="button primary" data-view="plan"><i data-lucide="route"></i>Открыть сегодняшний маршрут</button>`
            : `<button class="button primary" data-action="open-payment"><i data-lucide="unlock"></i>Получить доступ</button>`}
    </section>`;
}

function renderAnalysis() {
    const result = state.analysis;
    if (state.busy.analysis) return renderFaceAnalysisProgress();
    if (!isPro() && hasUsedFreeFaceAnalysis()) return renderFaceAnalysisLocked(result);
    if (!result) return renderFaceAnalysisWizard();
    const remaining = analysisCooldownRemaining("face");
    const canRun = canRunFaceAnalysis();
    const blockedByAccess = !isPro() && hasUsedFreeFaceAnalysis();
    const buttonBusy = state.busy.analysis;
    const buttonLabel = blockedByAccess ? "Открыть BodyPro" : remaining > 0 ? `Обновление через ${formatDuration(remaining)}` : "Оценить лицо";
    const buttonBusyLabel = "Сканирую...";
    return `<section class="section-panel">
        <p class="eyebrow">Анализ лица</p>
        <h1>Скан внешности</h1>
        <p class="muted">Загрузи фронтальное фото и, по желанию, боковой ракурс. BodyLab соберёт эстетический профиль, зоны роста и первые действия.</p>
        ${result && !blockedByAccess ? cooldownNotice("face") : ""}
        <div class="upload-grid">
            ${uploadTile("front", "Анфас", "хорошее освещение")}
            ${uploadTile("side", "Профиль", "по желанию")}
        </div>
        <button class="button primary ${buttonBusy ? "processing" : ""}" data-action="${blockedByAccess ? "open-payment" : "run-analysis"}" ${buttonBusy || (!blockedByAccess && !canRun) ? "disabled" : ""}>${buttonBusy ? buttonContent("Оценить лицо", buttonBusyLabel, "scan-line", true) : `<i data-lucide="${blockedByAccess ? "unlock" : "scan-line"}"></i><span ${!blockedByAccess && remaining > 0 ? countdownAttrs(Date.now() + remaining, "Обновление через ") : ""}>${buttonLabel}</span>`}</button>
    </section>
    ${result ? renderAnalysisResult(result) : ""}
    <section class="section-panel">
        <p class="eyebrow">Персональный план</p>
        <h2>${isPro() ? "Открыт" : "План закрыт"}</h2>
        <p class="muted">${isPro() ? "После анализа здесь появится 60-дневный маршрут по зонам." : "Персональный план доступен с BodyPro."}</p>
        ${isPro()
            ? `<button class="button secondary" data-view="plan">Открыть план</button>`
            : `<button class="button primary" data-action="open-payment">Получить доступ</button>`}
    </section>`;
}

function renderFaceAnalysisWizard() {
    const step = Math.max(1, Math.min(3, Number(state.analysisStep) || 1));
    const hasFront = Boolean(state.files.front || state.previews.front);
    if (step > 1 && !hasFront) {
        state.analysisStep = 1;
        return renderFaceAnalysisWizard();
    }
    if (step === 1) return renderFaceAnalysisStepFront(hasFront);
    if (step === 2) return renderFaceAnalysisStepSide();
    return renderFaceAnalysisStepReview();
}

function renderFaceStepShell(step, title, text, body) {
    return `<section class="section-panel face-flow-card">
        <p class="eyebrow">Анализ лица</p>
        <h1>Шаг ${step} · ${title}</h1>
        <p class="muted">${text}</p>
        ${faceStepDots(step)}
        ${body}
    </section>`;
}

function faceStepDots(active) {
    return `<div class="face-step-dots">${[1, 2, 3, 4].map(index => `<span class="${index < active ? "done" : index === active ? "active" : ""}"></span>`).join("")}</div>`;
}

function renderFaceAnalysisStepFront(hasFront) {
    return renderFaceStepShell(1, "Анфас", "Загрузи фронтальное фото лица.", `
        <div class="face-upload-stage">${uploadTile("front", "Загрузить анфас", "лицо прямо · хороший свет")}</div>
        <button class="button primary" data-action="analysis-next" ${hasFront ? "" : "disabled"}>Продолжить</button>
    `);
}

function renderFaceAnalysisStepSide() {
    const hasSide = Boolean(state.files.side || state.previews.side);
    return renderFaceStepShell(2, "Второе фото", "Профиль улучшает точность, но анализ можно сделать и по одному фото.", `
        <div class="face-upload-stage">${uploadTile("side", "Загрузить профиль", "по желанию")}</div>
        <button class="button primary" data-action="analysis-next">${hasSide ? "Продолжить" : "Пропустить"}</button>
        <p class="muted center">Можно сделать анализ по одному фото</p>
        <button class="button secondary" data-action="analysis-back"><i data-lucide="arrow-left"></i>Назад</button>
    `);
}

function renderFaceAnalysisStepReview() {
    const hasSide = Boolean(state.files.side || state.previews.side);
    return renderFaceStepShell(3, "Запуск", "Проверь фото и запусти анализ.", `
        <div class="face-review-grid">
            ${faceReviewPhoto("front", "Анфас")}
            ${hasSide ? faceReviewPhoto("side", "Профиль") : `<div class="face-review-photo empty"><span>нет</span><small>Профиль</small></div>`}
        </div>
        <div class="review-lines">
            <div><span>Пол</span><strong>${state.settings.gender === "female" ? "Женщина" : "Мужчина"}</strong></div>
            <div><span>Фото</span><strong>${hasSide ? "Анфас и профиль" : "Только анфас"}</strong></div>
            <div><span>Режим</span><strong>${isPro() ? "Полный анализ" : "Первый скан"}</strong></div>
        </div>
        <p class="muted">Проверь фото и запусти анализ.</p>
        <button class="button primary" data-action="run-analysis">Начать анализ</button>
        <button class="button secondary" data-action="analysis-back"><i data-lucide="arrow-left"></i>Назад</button>
    `);
}

function faceReviewPhoto(kind, label) {
    const src = state.previews[kind];
    return `<div class="face-review-photo ${src ? "has-photo" : ""}">
        ${src ? `<img src="${src}" alt="">` : `<span>нет</span>`}
        <small>${label}</small>
    </div>`;
}

function renderFaceAnalysisProgress() {
    return renderFaceStepShell(4, "Анализ", "Идёт построение карты лица и расчёт оценки...", `
        <div class="face-processing-stage">
            <div class="telegram-pill"><i data-lucide="send"></i><span>BodyLab</span></div>
            <div class="processing-face">${state.previews.front ? `<img src="${state.previews.front}" alt="">` : `<span class="brand-mark">B</span>`}</div>
            <p class="muted">Определяем точки и строим карту</p>
            <div class="scan-loader"><span></span></div>
        </div>
    `);
}

function renderFaceAnalysisLocked(result) {
    return renderFaceStepShell(4, "Анализ", "Финальный отчёт собран.", `
        <div class="locked-analysis-card">
            <span class="icon-shell"><i data-lucide="lock"></i></span>
            <p class="eyebrow">Доступ закрыт</p>
            <h2>${result ? "Анализ готов" : "Первый скан уже использован"}</h2>
            <p class="muted">Полная карта лица, разбор сильных сторон, шкалы и план улучшения открываются с BodyPro.</p>
            <button class="button primary" data-action="open-payment">Получить доступ</button>
        </div>
    `);
}

function renderAnalysisResult(result) {
    const metrics = (result.metrics || []).filter(item => !isStyleMetric(item?.name));
    const zones = (result.zones || []).filter(item => !isStyleMetric(item?.name));
    const routine = Array.isArray(result.routine) ? result.routine.filter(Boolean).slice(0, 5) : [];
    const score = Math.max(0, Math.min(100, Number(result.score) || 0));
    const comparison = result.comparison || scanComparison(state.analysisHistory[1], result, "face");
    return `<section class="section-panel analysis-result">
        <div class="analysis-score-card">
            <div class="score-orbit" style="--score:${score}">
                <div class="score-center"><strong>${score}</strong><span>/100</span></div>
            </div>
            <div>
                <p class="eyebrow">Результат скана</p>
                <h1>${score >= 82 ? "Сильная база" : score >= 68 ? "Хороший потенциал" : "Есть быстрые победы"}</h1>
                <p class="muted">${escapeHtml(cleanPublicText(result.summary || ""))}</p>
            </div>
        </div>
        <div class="analysis-metrics">
            ${metrics.map(analysisMetric).join("")}
        </div>
        ${renderScanComparison(comparison)}
        ${zones.length ? `<div class="analysis-zone-grid">${zones.map(analysisZone).join("")}</div>` : ""}
        ${routine.length ? `<div class="analysis-next-grid">
            ${routine.length ? `<article class="analysis-plan-card">
                <p class="eyebrow">Маршрут</p>
                <h3>Первые действия</h3>
                <ol class="routine-list">${routine.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
            </article>` : ""}
        </div>` : ""}
        <div class="analysis-followup">
            ${isPro()
                ? `<button class="button primary" data-view="plan"><i data-lucide="route"></i>Начать день ${currentPlanDay()}</button>`
                : `<button class="button primary" data-action="open-payment"><i data-lucide="unlock"></i>Открыть BodyPro</button>`}
            <button class="button secondary" data-action="ask-gpt" data-prompt="Составь мне первый день после анализа лица"><i data-lucide="brain"></i>Спросить BodyGPT</button>
        </div>
    </section>`;
}

function analysisMetric(item) {
    const value = Math.max(0, Math.min(100, Number(item.value) || 0));
    return `<article class="analysis-metric-card">
        <div class="analysis-metric-head">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${value}%</span>
        </div>
        <div class="track live-track"><span class="fill" style="--value:${value};width:${value}%"></span></div>
        <p class="muted">${escapeHtml(cleanPublicText(item.hint || ""))}</p>
    </article>`;
}

function analysisZone(zone) {
    return `<article class="analysis-zone-card">
        <span class="badge">${escapeHtml(zone.status || "фокус")}</span>
        <h3>${escapeHtml(zone.name || "Зона")}</h3>
        <p class="muted">${escapeHtml(cleanPublicText(zone.advice || ""))}</p>
    </article>`;
}

function renderBodyMax() {
    if (!isPro()) return renderLockedFeature("Body Max", "Оценка формы тела, цель по массе или похудению и недельный план открываются с BodyPro.");
    const profile = bodyProfile();
    const baseAssessment = bodyAssessment(profile);
    const remaining = analysisCooldownRemaining("body");
    const assessment = state.bodyAnalysis ? {
        ...baseAssessment,
        score: state.bodyAnalysis.score,
        title: state.bodyAnalysis.title,
        summary: baseAssessment.summary,
        comparison: state.bodyAnalysis.comparison,
        createdAt: state.bodyAnalysis.createdAt
    } : null;
    return `<section class="section-panel body-max">
        ${planToggleHtml("body")}
        <p class="eyebrow">Body Max</p>
        <h1>Форма тела</h1>
        <p class="muted">Загрузи фото формы, выбери цель и получи план по питанию, тренировкам и контрольным замерам.</p>
        ${assessment ? cooldownNotice("body") : ""}
        <div class="upload-grid">
            ${uploadTile("body", "Фото тела", "прямо, без сильного ракурса")}
            ${assessment ? `<div class="body-score-card">
                <div class="score-orbit" style="--score:${assessment.score}">
                    <div class="score-center"><strong>${assessment.score}</strong><span>/100</span></div>
                </div>
                <p class="eyebrow">Текущая оценка тела</p>
                <strong>${assessment.title}</strong>
                <p class="muted">${assessment.summary}</p>
            </div>` : `<div class="body-score-card empty">
                <span class="icon-shell"><i data-lucide="scan-line"></i></span>
                <p class="eyebrow">Текущая оценка тела</p>
                <strong>Ждёт фото</strong>
                <p class="muted">После оценки здесь появится балл, выводы и обновлённый план.</p>
            </div>`}
        </div>
        <div class="body-goals">
            ${[
                ["muscle", "Набор"],
                ["cut", "Похудение"],
                ["recomp", "Рекомпозиция"]
            ].map(([value, label]) => `<button class="chip ${profile.goal === value ? "active" : ""}" data-goal="${value}">${label}</button>`).join("")}
        </div>
        <div class="body-input-grid">
            <label>Рост, см<input id="bodyHeight" inputmode="numeric" value="${profile.height}"></label>
            <label>Вес, кг<input id="bodyWeight" inputmode="decimal" value="${profile.weight}"></label>
            <label>Талия, см<input id="bodyWaist" inputmode="decimal" value="${profile.waist}"></label>
            <label>Тренировок/нед.<input id="bodyWorkouts" inputmode="numeric" value="${profile.workouts}"></label>
        </div>
        ${planNudgeHtml("body")}
        <button class="button primary ${state.busy.body ? "processing" : ""}" data-action="run-body-analysis" ${state.busy.body || remaining > 0 ? "disabled" : ""}>${state.busy.body ? buttonContent("Оценить форму", "Оцениваю форму...", "scan-line", true) : `<i data-lucide="scan-line"></i><span ${remaining > 0 ? countdownAttrs(Date.now() + remaining, "Обновление через ") : ""}>${remaining > 0 ? `Обновление через ${formatDuration(remaining)}` : "Оценить форму"}</span>`}</button>
    </section>
    ${assessment ? renderBodyResult(assessment) : `<section class="section-panel body-plan-empty">
        <p class="eyebrow">План тела</p>
        <h2>Сначала оценка</h2>
        <p class="muted">План тренировок и питания появится после первого фото формы.</p>
    </section>`}`;
}

function renderBodyResult(assessment) {
    return `<section class="section-panel body-result">
        <p class="eyebrow">План под цель</p>
        <h2>${assessment.planTitle}</h2>
        ${renderScanComparison(assessment.comparison)}
        <div class="grid three body-kpis">
            <div class="stat-card"><small>Калории</small><strong>${assessment.calories}</strong><em>ккал/день</em></div>
            <div class="stat-card"><small>Белок</small><strong>${assessment.protein}</strong><em>г/день</em></div>
            <div class="stat-card"><small>Темп</small><strong>${assessment.pace}</strong><em>в неделю</em></div>
        </div>
        <div class="analysis-next-grid">
            <article class="analysis-plan-card">
                <p class="eyebrow">Неделя</p>
                <h3>${assessment.trainingTitle}</h3>
                <div class="training-week">${assessment.trainingDays.map(trainingDayCard).join("")}</div>
            </article>
            <article class="analysis-plan-card">
                <p class="eyebrow">Контроль</p>
                <h3>Отчётность</h3>
                <ol class="routine-list">${assessment.tracking.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
                <button class="button secondary" data-action="toggle-plan-tool" data-tool-id="body"><i data-lucide="${planToolActive("body") ? "check" : "plus"}"></i>${planToolActive("body") ? "BodyMax в плане" : "Добавить BodyMax в план"}</button>
            </article>
        </div>
    </section>`;
}

function trainingDayCard(day) {
    return `<div class="training-day-card">
        <div class="training-day-head">
            <strong>${escapeHtml(day.day)}</strong>
            <span>${escapeHtml(day.focus)}</span>
        </div>
        <div class="exercise-list">${day.exercises.map(exercise => `<div class="exercise-row">
            <b>${escapeHtml(exercise.name)}</b>
            <em>${escapeHtml(exercise.sets)}</em>
            <small>${escapeHtml(exercise.technique)}</small>
        </div>`).join("")}</div>
    </div>`;
}

function renderToolWorkspace(id) {
    const tool = toolWorkspaces[id];
    if (!tool) return renderFeatures();
    if (!isPro()) return renderLockedFeature(tool.title, `${tool.title} доступен с BodyPro.`);
    const kind = toolUploadKind(id);
    const report = state.toolReports[id];
    const busy = state.busy.tool === id;
    const remaining = analysisCooldownRemaining(id);
    return `<section class="section-panel tool-workspace">
        ${planToggleHtml(id)}
        <span class="icon-shell"><i data-lucide="${tool.icon}"></i></span>
        <p class="eyebrow">${tool.eyebrow}</p>
        <h1>${tool.title}</h1>
        <p class="muted">${tool.text}</p>
        ${planNudgeHtml(id)}
        ${report ? cooldownNotice(id) : ""}
        <div class="upload-grid">
            ${uploadTile(kind, tool.uploadTitle || "Фото для анализа", tool.uploadSubtitle || "хорошее освещение")}
            ${report ? `<div class="tool-scan-card">
                <div class="score-orbit" style="--score:${report.score}">
                    <div class="score-center"><strong>${report.score}</strong><span>/100</span></div>
                </div>
                <p class="eyebrow">Оценка</p>
                <strong>${escapeHtml(report.title)}</strong>
                <p class="muted">${escapeHtml(report.summary)}</p>
            </div>` : `<div class="tool-scan-card empty">
                <span class="icon-shell"><i data-lucide="${tool.icon}"></i></span>
                <p class="eyebrow">Оценка</p>
                <strong>Ждёт фото</strong>
                <p class="muted">${escapeHtml(tool.emptyText || "После фото появятся оценка, выводы и первые действия.")}</p>
            </div>`}
        </div>
        <button class="button primary ${busy ? "processing" : ""}" data-action="run-tool-analysis" data-tool-id="${id}" ${busy || remaining > 0 ? "disabled" : ""}>${busy ? buttonContent("Оценить", "Анализирую...", "scan-line", true) : `<i data-lucide="scan-line"></i><span ${remaining > 0 ? countdownAttrs(Date.now() + remaining, "Обновление через ") : ""}>${remaining > 0 ? `Обновление через ${formatDuration(remaining)}` : "Оценить"}</span>`}</button>
        ${id === "water" ? `<div class="coach-card water-enable-card">
            <i data-lucide="waves"></i>
            <div><strong>Трекер воды</strong><p class="muted">Закрепи воду в маршруте: полоска прогресса появится в плане и питании.</p></div>
            <button class="button secondary" data-action="toggle-plan-tool" data-tool-id="water">${planToolActive("water") ? "Убрать" : "Добавить"}</button>
        </div>` : ""}
    </section>
    ${report ? renderToolReport(id, tool, report) : `<section class="section-panel tool-empty-state">
        <p class="eyebrow">Следующий шаг</p>
        <h2>Сначала анализ</h2>
        <p class="muted">Загрузи фото и нажми “Оценить”, чтобы получить шкалы, вывод и мини-план.</p>
    </section>`}`;
}

function renderToolReport(id, tool, report) {
    const metrics = Array.isArray(report.metrics) ? report.metrics : [];
    const tasks = Array.isArray(report.tasks) ? report.tasks : tool.tasks || [];
    return `<section class="section-panel tool-report">
        <p class="eyebrow">Результат</p>
        <h2>${escapeHtml(report.headline || "Разбор готов")}</h2>
        <div class="analysis-metrics">${metrics.map(analysisMetric).join("")}</div>
        ${renderScanComparison(report.comparison)}
        <div class="analysis-next-grid">
            <article class="analysis-plan-card">
                <p class="eyebrow">Первые действия</p>
                <h3>Мини-план</h3>
                <ol class="routine-list">${tasks.map(task => `<li>${escapeHtml(task)}</li>`).join("")}</ol>
            </article>
            <article class="analysis-plan-card">
                <p class="eyebrow">Связать</p>
                <h3>В дневной план</h3>
                <p class="muted">${escapeHtml(report.planText || "Зафиксируй этот блок в отчёте дня и вернись к нему после нового фото.")}</p>
                <button class="button secondary" data-action="add-tool-to-plan" data-tool-id="${id}"><i data-lucide="route"></i>Закрепить в плане</button>
            </article>
        </div>
    </section>`;
}

function renderLockedFeature(title, text) {
    return `<section class="hero-panel">
        <p class="eyebrow">BodyPro</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="muted">${escapeHtml(text)}</p>
        <button class="button primary" data-action="open-payment"><i data-lucide="unlock"></i>Получить доступ</button>
    </section>`;
}

function renderPlan() {
    if (!isPro()) {
        return `<section class="hero-panel">
            <p class="eyebrow">План закрыт</p>
            <h1>Персональный план</h1>
            <p class="muted">После оплаты BodyPro план превращает анализ лица в 60 дней действий: кожа, волосы, стиль, питание, сон, фото.</p>
            <button class="button primary" data-action="open-payment"><i data-lucide="lock-keyhole-open"></i>Получить доступ</button>
        </section>`;
    }
    const day = selectedPlanDay();
    const today = currentPlanDay();
    const canEdit = canEditPlanDay(day);
    const phase = planPhase(day);
    const report = planReport(day);
    const dayTasks = planTasksForReport(day, report);
    const workout = bodyWorkoutForPlanDay(day);
    const completion = planDayCompletion(day, report, workout);
    const dayProgress = completion.percent;
    const savedReports = Object.entries(state.planReports).filter(([, item]) => item.updatedAt);
    const progress = savedReports.length
        ? Math.round(savedReports.reduce((sum, [dayKey, item]) => sum + planDayCompletion(Number(dayKey), item).ratio, 0) / savedReports.length * 100)
        : 0;
    const activeTools = activePlanTools();
    return `<section class="section-panel plan-hero">
        <div>
            <p class="eyebrow">60 дней</p>
            <h1>Дневной маршрут</h1>
            <div class="plan-hero-kpis">
                <span><b>День ${today}</b> текущий</span>
                <span><b>${dayProgress}%</b> день</span>
                <span><b>${activeTools.length}</b> трекеров</span>
            </div>
            <div class="phase-pills">${planPhases.map(item => `<button class="phase-pill ${day >= item.from && day <= item.to ? "active" : ""}" data-plan-day="${item.from}">
                <span>${item.from}-${item.to}</span>${escapeHtml(item.title)}
            </button>`).join("")}</div>
        </div>
        <div class="plan-radar" style="--progress:${progress}">
            <div class="plan-radar-center"><strong>${progress}%</strong><span>по отчётам</span></div>
        </div>
    </section>
    <section class="section-panel day-board ${canEdit ? "" : "locked"}">
        ${renderPlanDayRail(day, today)}
        <div class="day-board-head">
            <button class="icon-button ghost" data-plan-day="${Math.max(1, day - 1)}" ${day <= 1 ? "disabled" : ""} aria-label="Предыдущий день"><i data-lucide="chevron-left"></i></button>
            <div>
                <p class="eyebrow">${phase.title}</p>
                <h2>День ${day}</h2>
                <p class="muted">${dayStatusLabel(day, today)}. ${phase.accent}</p>
            </div>
            <button class="icon-button ghost" data-plan-day="${Math.min(60, day + 1)}" ${day >= 60 ? "disabled" : ""} aria-label="Следующий день"><i data-lucide="chevron-right"></i></button>
        </div>
        ${canEdit ? `<div class="coach-card"><i data-lucide="sparkles"></i><div><strong>Фокус дня</strong><p class="muted">Отметь выполненное, добавь короткий отчёт и оставь BodyLab следующую точку для корректировки.</p></div></div>` : `<div class="coach-card locked"><i data-lucide="lock"></i><div><strong>${day < today ? "День завершён" : "Предпросмотр"}</strong><p class="muted">${day < today ? "Можно перечитать отчёт и выводы, но менять отметки уже нельзя." : "Можно заранее посмотреть маршрут и подготовиться к следующему блоку."}</p></div></div>`}
        ${renderPlanToolShelf(day, canEdit)}
        ${renderPlanNutritionTargets()}
        ${workout ? renderPlanWorkout(workout, report, canEdit) : ""}
        <div class="day-progress-line"><span style="width:${dayProgress}%"></span></div>
        <div class="task-list">
            ${dayTasks.map((task, index) => `<label class="task-item ${report.tasks[index] ? "done" : ""}">
                <input type="checkbox" data-plan-task="${index}" ${report.tasks[index] ? "checked" : ""} ${canEdit ? "" : "disabled"}>
                <span><i data-lucide="${report.tasks[index] ? "check" : "circle"}"></i></span>
                <strong>${escapeHtml(task)}</strong>
            </label>`).join("")}
        </div>
        <div class="mood-row">
            ${["свежо", "норм", "устал", "рывок"].map(mood => `<button class="chip ${report.mood === mood ? "active" : ""}" data-plan-mood="${mood}" ${canEdit ? "" : "disabled"}>${mood}</button>`).join("")}
        </div>
        <textarea class="note-input" id="planNote" rows="4" placeholder="Короткий отчёт дня: что сделал, что сработало, что мешало" ${canEdit ? "" : "disabled"}>${escapeHtml(report.note || "")}</textarea>
        <button class="button primary" data-action="save-plan-report" ${canEdit ? "" : "disabled"}><i data-lucide="clipboard-check"></i>${canEdit ? "Сохранить отчёт дня" : "Отчёт доступен в активный день"}</button>
    </section>
    <section class="section-panel report-board">
        <p class="eyebrow">Отчётность</p>
        <h2>Последние дни</h2>
        <div class="report-list">${renderPlanReportList()}</div>
    </section>
    `;
}

function renderGpt() {
    if (state.chat.length === 0) {
        state.chat.push({ role: "assistant", text: gptWelcomeText() });
        saveChatHistory();
    }
    const usage = chatUsageView();
    return `<section class="section-panel chat-window">
        <div class="assistant-head">
            <span class="brand-mark">AI</span>
            <div><h3>BodyGPT</h3><p class="eyebrow" style="margin:0">${isPro() ? "личный помощник" : "на связи"}</p></div>
            <span class="chat-quota ${usage.remaining <= 10 ? "low" : ""}">${usage.used}/${usage.limit}</span>
        </div>
        <div class="chat-list" id="chatList">${state.chat.map(chatMessageHtml).join("")}</div>
        <div class="chips">${["Что делать сегодня", "Отёки", "Питание", "План тренировки"].map(text => `<button class="chip" data-chat-chip="${text}">${text}</button>`).join("")}</div>
        <form class="composer" id="chatForm">
            <input id="chatInput" placeholder="Спроси что-нибудь..." autocomplete="off" enterkeyhint="send" ${state.busy.chat ? "disabled" : ""}>
            <button class="button primary send-button" aria-label="Отправить" ${state.busy.chat ? "disabled" : ""}>${state.busy.chat ? `<span class="mini-loader"></span>` : `<i data-lucide="send"></i>`}</button>
        </form>
    </section>`;
}

function renderNutrition() {
    const data = state.nutrition || { calories: 0, targetCalories: 2200, protein: 0, fat: 0, carbs: 0, logs: [] };
    const targets = nutritionTargets(data);
    return `<section class="section-panel">
        <div class="nutrition-head">
            <div>
                <p class="eyebrow">Питание</p>
                <h1>Дневник КБЖУ</h1>
            </div>
            <button class="button quiet nutrition-history-button" data-toggle-nutrition-history><i data-lucide="history"></i>История</button>
        </div>
        <p class="muted">Считай калории и БЖУ, воду и базовую отчётность по рациону.</p>
        ${targets.source === "body" ? `<div class="coach-card nutrition-sync"><i data-lucide="activity"></i><div><strong>Цель из BodyMax</strong><p class="muted">${targets.label}</p></div></div>` : ""}
        <div class="nutrition-ring"><div><strong>${data.calories}</strong><span class="muted"> / ${targets.calories} ккал</span></div></div>
        ${metric("Белки", pct(data.protein, targets.protein), `${data.protein} г / ${targets.protein} г`)}
        ${metric("Жиры", pct(data.fat, targets.fat), `${data.fat} г / ${targets.fat} г`)}
        ${metric("Углеводы", pct(data.carbs, targets.carbs), `${data.carbs} г / ${targets.carbs} г`)}
        ${state.water.enabled ? waterTrackerHtml("nutrition") : ""}
    </section>
    ${state.nutritionHistoryOpen ? renderNutritionHistory(targets) : ""}
    <section class="section-panel">
        <h2>Добавить приём пищи</h2>
        <div class="meal-controls">
            <div class="segmented" id="mealType">${["breakfast:Завтрак","lunch:Обед","dinner:Ужин","snack:Перекус"].map(pair => {
                const [value, label] = pair.split(":");
                return `<button data-value="${value}" class="${state.mealType === value ? "active" : ""}">${label}</button>`;
            }).join("")}</div>
            <input class="meal-input" id="mealInput" placeholder="Напр.: 2 яйца, тост с авокадо">
            ${isPro() ? "" : `<div class="coach-card locked"><i data-lucide="lock"></i><div><strong>AI-оценка с BodyPro</strong><p class="muted">Дневник открыт, а автоматический разбор еды подключается с подпиской.</p></div></div>`}
            <button class="button primary ${state.busy.meal ? "processing" : ""}" data-action="add-meal" ${state.busy.meal ? "disabled" : ""}>${buttonContent(isPro() ? "Оценить и добавить" : "Оценить с BodyPro", "Считаю КБЖУ...", "wand-sparkles", state.busy.meal)}</button>
            ${state.busy.meal ? `<div class="coach-card"><span class="mini-loader"></span><div><strong>Разбираю приём пищи</strong><p class="muted">Считаю калории и БЖУ, затем добавлю запись в дневник.</p></div></div>` : ""}
            <div class="zone-list">${(data.logs || []).map(log => `<div class="zone-card"><strong>${escapeHtml(log.title)}<em>${log.calories} ккал</em></strong><p class="muted">Б ${log.protein} · Ж ${log.fat} · У ${log.carbs}</p></div>`).join("")}</div>
        </div>
    </section>`;
}

function renderNutritionHistory(targets) {
    const days = state.nutritionHistory?.days || [];
    return `<section class="section-panel nutrition-history">
        <p class="eyebrow">История</p>
        <h2>КБЖУ по дням</h2>
        ${state.nutritionHistoryOpen && !state.nutritionHistory ? `<div class="coach-card"><span class="mini-loader"></span><div><strong>Поднимаю историю</strong><p class="muted">Собираю дни питания и прогресс по КБЖУ.</p></div></div>` : days.length ? `<div class="nutrition-history-list">${days.map(day => `<article class="nutrition-day-card">
            <div><strong>${formatDayLabel(day.dayKey)}</strong><small>${day.meals} приёмов</small></div>
            <span>${day.calories} / ${targets.calories} ккал</span>
            <div class="track"><span class="fill" style="width:${pct(day.calories, targets.calories)}%"></span></div>
            <p class="muted">Б ${day.protein} · Ж ${day.fat} · У ${day.carbs}</p>
        </article>`).join("")}</div>` : `<div class="admin-empty">История появится после первых записей в дневнике.</div>`}
    </section>`;
}

function renderAcademy() {
    const selected = guideLibrary.find(guide => guide.id === state.selectedGuide);
    if (selected) return renderGuideDetail(selected);
    if (state.selectedGuideCategory) return renderGuideCategory(state.selectedGuideCategory);
    const categories = guideCategories.filter(category => category.track === state.guideTrack);
    return `<section class="section-panel academy-home">
        <p class="eyebrow">Академия</p>
        <h1>Гайды</h1>
        <p class="muted">Большие справочники с чеклистами и конкретными правилами: уход, волосы, фото, тело, стиль и осознанные решения.</p>
        <div class="segmented guide-track-tabs">
            <button class="${state.guideTrack === "soft" ? "active" : ""}" data-guide-track="soft">Softmaxxing</button>
            <button class="${state.guideTrack === "hard" ? "active" : ""}" data-guide-track="hard">Hardmaxxing</button>
        </div>
        <div class="guide-category-grid">${categories.map(category => `<article class="guide-category-card ${category.track === "hard" ? "hard" : ""}">
            <span class="icon-shell"><i data-lucide="${category.icon}"></i></span>
            <span class="badge">${category.tag}</span>
            <h3>${category.title}</h3>
            <small>Всего гайдов: ${guidesForCategory(category.id).length}</small>
            <button class="button secondary" data-guide-category="${category.id}"><i data-lucide="book-open"></i>Смотреть гайды</button>
        </article>`).join("")}</div>
    </section>`;
}

function renderGuideCategory(categoryId) {
    const category = guideCategories.find(item => item.id === categoryId) || guideCategories[0];
    const guides = guidesForCategory(category.id);
    return `<section class="section-panel academy-home">
        <button class="button quiet guide-back" data-action="back-guide-categories"><i data-lucide="chevron-left"></i>Разделы</button>
        <div class="guide-category-hero">
            <span class="icon-shell"><i data-lucide="${category.icon}"></i></span>
            <div>
                <p class="eyebrow">${category.tag}</p>
                <h1>${category.title}</h1>
                <p class="muted">Всего гайдов: ${guides.length}</p>
            </div>
        </div>
        <div class="guide-list-grid">${guides.map(guide => `<article class="guide-list-card ${category.track === "hard" ? "hard" : ""}">
            <span class="badge">${guide.tag}</span>
            <h3>${guide.title}</h3>
            <p class="muted">${guide.intro}</p>
            <div class="guide-card-foot"><span><i data-lucide="heart"></i> ${guide.likes}</span><button class="button secondary" data-guide="${guide.id}">Открыть</button></div>
        </article>`).join("")}</div>
    </section>`;
}

function renderGuideDetail(guide) {
    return `<section class="section-panel guide-detail">
        <button class="button quiet guide-back" data-action="back-guides"><i data-lucide="chevron-left"></i>${state.selectedGuideCategory ? "К списку" : "Все гайды"}</button>
        <p class="eyebrow">${guide.tag}</p>
        <h1>${guide.title}</h1>
        <p class="muted">${guide.intro}</p>
        <div class="guide-section-list">${guide.sections.map(section => `<article class="guide-section">
            <h2>${escapeHtml(section.title)}</h2>
            <p>${escapeHtml(section.text)}</p>
            <ul class="guide-list">${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </article>`).join("")}
        ${guideProtocol(guide)}</div>
        <div class="analysis-followup">
            <button class="button primary" data-action="add-guide-to-plan" data-guide-id="${guide.id}"><i data-lucide="route"></i>Внести в маршрут</button>
            <button class="button secondary" data-action="ask-gpt" data-prompt="Помоги применить гайд: ${escapeHtml(guide.title)}"><i data-lucide="brain"></i>Спросить BodyGPT</button>
        </div>
    </section>`;
}

function guideProtocol(guide) {
    return `<article class="guide-section guide-protocol">
        <h2>Как внедрять без хаоса</h2>
        <p>Главная ошибка — пытаться поменять всё за один вечер. Работай мягче: маленькие действия, контрольные фото, отчётность и корректировка по факту. Так результат становится видимым и не разваливается через неделю.</p>
        <ul class="guide-list">
            <li>Выбери один главный фокус из гайда и внеси его в сегодняшний маршрут.</li>
            <li>Сделай базовое фото или заметку “до”, чтобы видеть не ощущения, а разницу.</li>
            <li>Повтори действие 7 дней подряд без добавления новых экспериментов.</li>
            <li>На 8-й день сравни фото, отметки и самочувствие, затем попроси BodyGPT скорректировать следующий шаг.</li>
            <li>Если действие не даёт эффекта, меняй только один параметр: свет, продукт, калории, тренировочный объём или посадку вещи.</li>
        </ul>
        <div class="guide-control-card">
            <span class="icon-shell"><i data-lucide="bookmark-check"></i></span>
            <div>
                <p class="eyebrow">Контроль</p>
                <h3>Сохрани правило</h3>
                <p class="muted">Финальная цель гайда — не прочитать текст, а получить одно рабочее правило, которое попадёт в твой 60-дневный маршрут.</p>
            </div>
        </div>
    </article>`;
}

function buildGuideLibrary() {
    return Object.entries(guideSeeds).flatMap(([categoryId, titles]) => {
        const category = guideCategories.find(item => item.id === categoryId) || guideCategories[0];
        return titles.map((title, index) => makeGuide(category, title, index + 1));
    });
}

function makeGuide(category, title, index) {
    const id = `${category.id}-${index}`;
    return {
        id,
        categoryId: category.id,
        tag: category.tag,
        title,
        intro: guideIntroFor(category, title),
        likes: 1 + (index % 7),
        sections: guideSectionsFor(category, title)
    };
}

function guidesForCategory(categoryId) {
    return guideLibrary.filter(guide => guide.categoryId === categoryId);
}

function guideIntroFor(category, title) {
    const intro = {
        skin: "Уход, который делает лицо свежее без хаотичных покупок и резких экспериментов.",
        hair: "Как волосы, контур и укладка меняют восприятие лица уже в первые секунды.",
        brows: "Брови и взгляд: форма, плотность, контраст и аккуратность без перегиба.",
        style: "Одежда как рамка для лица и тела: силуэт, посадка, цвет и чистая сборка.",
        posture: "Осанка, шея, плечи и походка: визуальная собранность каждый день.",
        photo: "Свет, ракурс, выражение и отбор кадров для профиля и социальных сетей.",
        body: "Тело, питание и тренировки как часть внешности, а не отдельный проект.",
        jaw: "Что реально влияет на нижнюю треть лица, а где лучше не форсировать.",
        ortho: "Как готовиться к консультации и понимать варианты коррекции улыбки.",
        bite: "Профиль, прикус и симметрия: когда стоит собирать мнение специалиста.",
        operations: "Информационный разбор: вопросы, ожидания, риски и трезвый фильтр решений.",
        implants: "Что учитывать до любых необратимых решений и как думать о пропорциях."
    }[category.id] || "Практичный справочник BodyLab с чеклистами и контрольными действиями.";
    return `${title}. ${intro}`;
}

function guideSectionsFor(category, title) {
    const focus = title.toLowerCase();
    return [
        {
            title: "Что это меняет",
            text: `${title} влияет на то, как лицо и образ считываются целиком. Смысл гайда — выделить управляемые действия, которые можно повторять и отслеживать без хаоса.`,
            items: [
                "Определи стартовую точку: фото, заметка или короткий замер.",
                "Выбери один главный параметр, который меняешь в первую неделю.",
                "Не смешивай сразу несколько новых привычек, иначе будет непонятно, что сработало."
            ]
        },
        {
            title: "Практический протокол",
            text: `Работай с темой “${focus}” как с маленьким экспериментом: действие, наблюдение, корректировка. Так BodyLab сможет связать гайд с маршрутом и отчётами.`,
            items: [
                "День 1: сделай фото или отметку “до”.",
                "Дни 2-6: повторяй выбранное действие в одно и то же время.",
                "День 7: сравни результат и добавь вывод в дневной маршрут."
            ]
        },
        {
            title: "Ошибки",
            text: "Внешность чаще портят не отсутствие идеального решения, а резкие скачки и плохая обратная связь.",
            items: [
                "Не оценивай результат по одному случайному фото.",
                "Не покупай сразу много продуктов или вещей под одну идею.",
                category.track === "hard" ? "Для необратимых решений собирай консультации, вопросы и сроки восстановления заранее." : "Сохраняй привычку маленькой, пока она не стала автоматической."
            ]
        }
    ];
}

function renderBattle() {
    const opponent = selectedBattleOpponent();
    const ownPreview = state.previews.front;
    const ownScore = battleOwnScore();
    const winrate = state.battleHistory.length
            ? Math.round(state.battleHistory.filter(item => item.result === "win").length / state.battleHistory.length * 100)
            : 0;
    const elo = battleElo();
    return `<section class="section-panel battle-arena">
        <p class="eyebrow">MogBattle</p>
        <h1>MogBattle</h1>
        <p class="muted">Соперник выпадает случайно. Баттл сравнивает общий визуальный уровень: лицо, кожу, контур, стиль, форму и качество фото.</p>
        <div class="battle-stats">
            <div class="battle-stat"><small>ELO</small><strong>${elo}</strong></div>
            <div class="battle-stat"><small>Ранг</small><strong>${battleRank(elo)}</strong></div>
            <div class="battle-stat"><small>Winrate</small><strong>${winrate}%</strong></div>
        </div>
        <div class="battle-stage">
            <div class="fighter-card">
                <div class="fighter-photo ${ownPreview ? "has-photo" : ""}">${ownPreview ? `<img src="${ownPreview}" alt="">` : `<span class="brand-mark">B</span>`}</div>
                <strong>Ты</strong>
                <small>${ownScore ? `${ownScore}/100` : "нужен анализ или фото"}</small>
            </div>
            <div class="versus-core">VS</div>
            <div class="fighter-card">
                ${state.battleResult ? `<div class="fighter-photo has-photo"><img src="${opponent.image}" alt=""></div>
                <strong>${opponent.name}</strong>
                <small>${opponent.tier} · ${opponent.score}/100</small>` : `<div class="fighter-photo mystery"><span class="brand-mark">?</span></div>
                <strong>Случайный соперник</strong>
                <small>откроется после запуска</small>`}
            </div>
        </div>
        <button class="button primary ${state.busy.battle ? "processing" : ""}" data-action="run-battle" ${state.busy.battle ? "disabled" : ""}>${buttonContent("Запустить баттл", "Сравниваю...", "swords", state.busy.battle)}</button>
        ${state.battleResult ? renderBattleResult() : ""}
        <div class="battle-history-board">
            <p class="eyebrow">История боёв</p>
            ${state.battleHistory.length ? `<div class="battle-history-grid">${state.battleHistory.slice(0, 6).map(battleHistoryCard).join("")}</div>` : `<div class="admin-empty">История появится после первого баттла.</div>`}
        </div>
    </section>`;
}

function renderBattleResult() {
    const result = state.battleResult;
    return `<div class="battle-result ${result.result}">
        <p class="eyebrow">${result.result === "win" ? "Победа" : result.result === "tie" ? "Ничья" : "Поражение"}</p>
        <h2>${result.ownScore} : ${result.opponentScore}</h2>
        <div class="battle-scoreline">
            <span><b>Ты</b><i style="width:${result.ownScore}%"></i></span>
            <span><b>${escapeHtml(result.name)}</b><i style="width:${result.opponentScore}%"></i></span>
        </div>
        <p class="muted">${escapeHtml(result.advice)}</p>
    </div>`;
}

function battleHistoryCard(item) {
    return `<article class="battle-history-card">
        <img src="${item.image || selectedBattleOpponent().image}" alt="">
        <div>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${item.result === "win" ? "победа" : item.result === "tie" ? "ничья" : "поражение"} · ${item.ownScore}:${item.opponentScore}</small>
        </div>
        <em>${item.eloDelta > 0 ? "+" : ""}${item.eloDelta}</em>
    </article>`;
}

function renderAdmin() {
    if (!state.boot?.isAdmin) {
        return `<section class="section-panel"><p class="eyebrow">Доступ закрыт</p><h1>Админка</h1><p class="muted">Этот раздел видят только администраторы.</p></section>`;
    }
    const admin = state.admin;
    if (!admin) {
        return `<section class="section-panel"><p class="eyebrow">Админка</p><h1>Загрузка</h1><div class="skeleton"></div></section>`;
    }
    const stats = admin.stats || {};
    const conversion = pct(stats.paidPayments || 0, Math.max(1, stats.users || 1));
    return `<section class="section-panel admin-hero">
        <div>
            <p class="eyebrow">Admin Control</p>
            <h1>Пульт роста</h1>
            <p class="muted">Деньги, пользователи, тарифы и состояние интеграций в одном месте.</p>
            <div class="admin-actions">
                <button class="button primary" data-action="refresh-admin"><i data-lucide="rotate-cw"></i>Обновить</button>
                <button class="button secondary" data-action="copy-admin-snapshot"><i data-lucide="copy"></i>Сводка</button>
            </div>
        </div>
        <div class="admin-system-card">
            <span class="admin-live-dot"></span>
            <h3>Система</h3>
            <div class="admin-status-grid">
                ${adminStatus("Бот", admin.system?.botConfigured, admin.system?.longPolling ? "принимает сообщения" : "подключён")}
                ${adminStatus("Ассистент", admin.system?.aiConfigured, "ответы и анализ")}
                ${adminStatus("Карты", admin.system?.cardConfigured, "СБП/Карта/Юмани")}
                ${adminStatus("Крипто", admin.system?.cryptoConfigured, "счета в Telegram")}
            </div>
        </div>
    </section>
    <section class="section-panel admin-kpi-panel">
        <p class="eyebrow">Пульс проекта</p>
        <div class="admin-kpi-grid">
            ${adminKpi("Пользователи", stats.users || 0, `+${stats.newUsers7d || 0} за 7 дней`, "users")}
            ${adminKpi("Активные Pro", stats.activeSubscriptions || 0, `${conversion}% пользователей оплатили`, "sparkles")}
            ${adminKpi("Выручка", `${formatCompact(stats.rubRevenue || 0)} ₽`, `${formatCompact(stats.starsRevenue || 0)} Stars · ${formatCompact(stats.usdRevenue || 0)} USDT`, "wallet")}
            ${adminKpi("Активность", stats.analyses || 0, `средняя оценка ${stats.avgScore || 0} · питание ${stats.meals || 0}`, "activity")}
        </div>
    </section>
    <section class="section-panel admin-insights">
        <div class="admin-panel-head">
            <div>
                <p class="eyebrow">Монетизация</p>
                <h2>Провайдеры</h2>
            </div>
            <span class="badge">${stats.paidPayments7d || 0} оплат за 7 дней</span>
        </div>
        <div class="admin-provider-list">${(admin.providerStats || []).length ? admin.providerStats.map(adminProviderRow).join("") : emptyAdmin("Платежей пока нет")}</div>
    </section>
    <section class="section-panel admin-insights">
        <div class="admin-panel-head">
            <div>
                <p class="eyebrow">Воронка</p>
                <h2>Тарифы и статусы</h2>
            </div>
        </div>
        <div class="admin-split-grid">
            <div class="admin-mini-board">
                <h3>Тарифы</h3>
                ${(admin.planStats || []).length ? admin.planStats.map(adminPlanPulse).join("") : emptyAdmin("Тарифы еще не покупали")}
            </div>
            <div class="admin-mini-board">
                <h3>Статусы оплат</h3>
                ${(admin.paymentStatusStats || []).length ? admin.paymentStatusStats.map(adminStatusPulse).join("") : emptyAdmin("Событий оплат пока нет")}
            </div>
        </div>
    </section>
    <section class="section-panel admin-tariffs">
        <p class="eyebrow">Тарифы</p>
        <h2>Редактор цен</h2>
        <div class="admin-plan-list">${(admin.plans || state.boot.plans).map(adminPlanEditor).join("")}</div>
    </section>
    <section class="section-panel admin-grant-panel">
        <p class="eyebrow">Поддержка</p>
        <h2>Выдать BodyPro вручную</h2>
        <p class="muted">Для компенсации платежа или ручной поддержки: укажи Telegram ID пользователя и тариф.</p>
        <div class="admin-form">
            <input class="meal-input" id="grantTelegramId" inputmode="numeric" placeholder="Telegram ID пользователя">
            <select class="select-input" id="grantPlanCode">
                ${state.boot.plans.map(plan => `<option value="${plan.code}">${escapeHtml(plan.title)} · ${plan.days} дн.</option>`).join("")}
            </select>
            <button class="button primary" data-action="grant-subscription"><i data-lucide="badge-check"></i>Активировать доступ</button>
        </div>
    </section>
    <section class="section-panel">
        <p class="eyebrow">Админы</p>
        <h2>Добавить администратора</h2>
        <div class="admin-form">
            <input class="meal-input" id="adminTelegramId" inputmode="numeric" placeholder="Telegram ID">
            <input class="meal-input" id="adminNote" placeholder="Комментарий">
            <button class="button primary" data-action="add-admin"><i data-lucide="user-plus"></i>Добавить</button>
        </div>
        <div class="zone-list">${(admin.admins || []).map(item => `<div class="zone-card"><strong>${item.telegramId}<em>${escapeHtml(item.note || "")}</em></strong><p class="muted">${formatDate(item.createdAt)}</p></div>`).join("")}</div>
    </section>
    <section class="section-panel admin-live-feed">
        <div class="admin-panel-head">
            <div>
                <p class="eyebrow">Live feed</p>
                <h2>Последние события</h2>
            </div>
        </div>
        <div class="admin-feed-grid">
            <div>
                <h3>Платежи</h3>
                <div class="zone-list">${(admin.recentPayments || []).map(adminPaymentItem).join("") || emptyAdmin("Платежей пока нет")}</div>
            </div>
            <div>
                <h3>Пользователи</h3>
                <div class="zone-list">${(admin.recentUsers || []).map(adminUserItem).join("") || emptyAdmin("Пользователей пока нет")}</div>
            </div>
            <div>
                <h3>Анализы</h3>
                <div class="zone-list">${(admin.recentAnalyses || []).map(adminAnalysisItem).join("") || emptyAdmin("Анализов пока нет")}</div>
            </div>
        </div>
    </section>`;
}

function adminKpi(label, value, hint, icon) {
    return `<div class="admin-kpi-card">
        <span class="icon-shell"><i data-lucide="${icon}"></i></span>
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(String(value))}</strong>
        <em>${escapeHtml(hint)}</em>
    </div>`;
}

function adminStatus(label, active, detail) {
    return `<div class="admin-status ${active ? "online" : "offline"}">
        <span></span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(detail || (active ? "online" : "offline"))}</small>
    </div>`;
}

function adminProviderRow(item) {
    const total = Number(item.total || 0);
    const paid = Number(item.paid || 0);
    const percent = pct(paid, Math.max(1, total));
    return `<div class="admin-provider-row">
        <div>
            <strong>${escapeHtml(providerLabel(item.provider))}</strong>
            <small>${paid}/${total} оплачено · ${percent}%</small>
        </div>
        <div class="admin-provider-money">${formatCompact(item.rubRevenue || 0)} ₽<span>${formatCompact(item.starsRevenue || 0)} Stars · ${formatCompact(item.usdRevenue || 0)} USDT</span></div>
        <div class="track"><span class="fill" style="width:${percent}%"></span></div>
    </div>`;
}

function adminPlanPulse(item) {
    const plan = state.boot.plans.find(plan => plan.code === item.planCode);
    const title = plan?.title || item.planCode;
    const percent = pct(item.paid || 0, Math.max(1, item.total || 1));
    return `<div class="admin-pulse-row">
        <span>${escapeHtml(title)}</span>
        <strong>${item.paid}/${item.total}</strong>
        <div class="track"><span class="fill" style="width:${percent}%"></span></div>
    </div>`;
}

function adminStatusPulse(item) {
    const totalPayments = Math.max(1, Number(state.admin?.stats?.payments || 1));
    const percent = pct(item.total || 0, totalPayments);
    return `<div class="admin-pulse-row">
        <span>${escapeHtml(statusLabel(item.status))}</span>
        <strong>${item.total}</strong>
        <div class="track"><span class="fill" style="width:${percent}%"></span></div>
    </div>`;
}

function adminPlanEditor(plan) {
    return `<div class="admin-plan" data-admin-plan="${plan.code}">
        <div class="admin-plan-head">
            <span class="icon-shell"><i data-lucide="badge-dollar-sign"></i></span>
            <div>
            <h3>${escapeHtml(plan.title)}</h3>
            <p class="muted">${escapeHtml(plan.subtitle)}</p>
            </div>
            ${plan.badge ? `<span class="badge">${escapeHtml(plan.badge)}</span>` : ""}
        </div>
        <div class="admin-price-grid">
            <label>₽<input inputmode="numeric" data-field="rub" value="${plan.rub}"></label>
            <label>Stars<input inputmode="numeric" data-field="stars" value="${plan.stars}"></label>
            <label>USDT<input inputmode="decimal" data-field="usd" value="${plan.usd}"></label>
            <label>Бейдж<input data-field="badge" value="${escapeHtml(plan.badge || "")}"></label>
        </div>
        <button class="button secondary" data-action="save-plan" data-plan-code="${plan.code}"><i data-lucide="save"></i>Сохранить тариф</button>
    </div>`;
}

function adminPaymentItem(item) {
    return `<div class="zone-card admin-feed-item"><strong>${escapeHtml(providerLabel(item.provider))} · ${escapeHtml(planTitle(item.planCode))}<em>${escapeHtml(statusLabel(item.status))}</em></strong><p class="muted">${item.telegramId} · ${escapeHtml(item.amount)} ${escapeHtml(item.currency)} · ${formatDate(item.createdAt)}</p></div>`;
}

function adminUserItem(item) {
    return `<div class="zone-card admin-feed-item"><strong>${escapeHtml(item.firstName || "Пользователь")}<em>${item.telegramId}</em></strong><p class="muted">${item.username ? "@" + escapeHtml(item.username) + " · " : ""}${formatDate(item.createdAt)}</p></div>`;
}

function adminAnalysisItem(item) {
    return `<div class="zone-card admin-feed-item"><strong>${escapeHtml(item.firstName || item.username || "Анализ")}<em>${item.score}/100</em></strong><p class="muted">${item.telegramId} · ${formatDate(item.createdAt)}</p></div>`;
}

function emptyAdmin(text) {
    return `<div class="admin-empty">${escapeHtml(text)}</div>`;
}

function providerLabel(provider) {
    return {
        telegram_stars: "Telegram Stars",
        crypto_pay: "Криптовалюта",
        card: "Карта",
        yookassa: "Карта"
    }[provider] || provider || "Оплата";
}

function statusLabel(status) {
    return {
        PENDING: "ожидает",
        PAID: "оплачено",
        CANCELLED: "отменено",
        FAILED: "ошибка"
    }[status] || status || "статус";
}

function planTitle(code) {
    return state.boot?.plans?.find(plan => plan.code === code)?.title || code || "Тариф";
}

function metric(name, value, hint = "") {
    const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
    return `<div class="metric-row"><strong>${escapeHtml(name)}</strong><div class="track"><span class="fill" style="width:${safeValue}%"></span></div><span>${escapeHtml(String(hint || safeValue))}</span></div>`;
}

function nutritionTargets(data = state.nutrition || {}) {
    if (planToolActive("body")) {
        const profile = state.bodyAnalysis?.profile || bodyProfile();
        const assessment = state.bodyAnalysis || bodyAssessment(profile);
        const fat = Math.max(45, Math.round(profile.weight * 0.8));
        const carbs = Math.max(90, Math.round((assessment.calories - assessment.protein * 4 - fat * 9) / 4));
        return {
            source: "body",
            label: `${assessment.planTitle}: ${assessment.calories} ккал и ${assessment.protein} г белка`,
            calories: assessment.calories,
            protein: assessment.protein,
            fat,
            carbs
        };
    }
    return {
        source: "base",
        label: "Базовая цель",
        calories: Number(data.targetCalories || 2200),
        protein: 150,
        fat: 70,
        carbs: 250
    };
}

function formatDayLabel(dayKey) {
    const [year, month, day] = String(dayKey || "").split("-");
    if (!day || !month) return escapeHtml(dayKey || "День");
    return `${day}.${month}.${String(year || "").slice(2)}`;
}

function waterTrackerHtml(context = "nutrition") {
    const water = ensureWaterState();
    const percent = pct(water.amountMl, water.targetMl);
    const disabled = context === "plan" && !canEditPlanDay(selectedPlanDay());
    return `<div class="water-tracker ${context}">
        <div class="water-head">
            <strong>Вода</strong>
            <span>${water.amountMl} мл / ${water.targetMl} мл</span>
        </div>
        <div class="track water-track"><span class="fill water-fill" style="width:${percent}%"></span></div>
        <div class="water-actions">
            <button class="button secondary" data-action="add-water" data-amount="250" ${disabled ? "disabled" : ""}>+250</button>
            <button class="button secondary" data-action="add-water" data-amount="500" ${disabled ? "disabled" : ""}>+500</button>
            <button class="button secondary" data-action="add-water" data-amount="1000" ${disabled ? "disabled" : ""}>+1 л</button>
        </div>
    </div>`;
}

function ensureWaterState() {
    const key = bodylabDayKey();
    if (!state.water || typeof state.water !== "object") {
        state.water = { enabled: false, amountMl: 0, targetMl: 2500, dayKey: key };
    }
    if (state.water.dayKey !== key) {
        state.water = { ...state.water, amountMl: 0, dayKey: key };
        saveWaterState();
    }
    state.water.targetMl = Math.max(1200, Number(state.water.targetMl || 2500));
    state.water.amountMl = Math.max(0, Number(state.water.amountMl || 0));
    return state.water;
}

function addWater(amount) {
    const water = ensureWaterState();
    water.enabled = true;
    water.amountMl = Math.min(water.targetMl + 1000, water.amountMl + Math.max(0, amount));
    saveWaterState();
    render();
}

function resetWater() {
    const water = ensureWaterState();
    water.amountMl = 0;
    saveWaterState();
    render();
}

function featureCard(feature) {
    const hot = ["gpt", "body", "battle"].includes(feature.id);
    const remaining = featureCooldownRemaining(feature.id);
    const timer = remaining > 0
        ? `<small class="feature-timer" ${countdownAttrs(Date.now() + remaining, "Обновление через ")}>Обновление через ${formatDuration(remaining)}</small>`
        : "";
    return `<button class="feature-card ${hot ? "is-hot" : ""}" data-view="${viewForFeature(feature.id)}">
        <span class="icon-shell"><i data-lucide="${feature.icon}"></i></span>
        <span><strong>${feature.title}</strong><small>${feature.subtitle}</small>${timer}</span>
    </button>`;
}

function planCard(plan) {
    const selected = state.selectedPlan === plan.code;
    return `<button class="plan-card ${selected ? "selected" : ""}" data-plan="${plan.code}">
        <span><strong>${plan.title}</strong><small>${plan.subtitle}</small>${plan.badge ? `<span class="badge">${plan.badge}</span>` : ""}</span>
        <span class="price">${plan.rub} ₽</span>
    </button>`;
}

function paymentPlanCard(plan) {
    const selected = state.selectedPlan === plan.code;
    return `<button class="plan-card payment-plan-card ${selected ? "selected" : ""}" data-payment-plan="${plan.code}" ${state.busy.payment ? "disabled" : ""}>
        <span><strong>${plan.title}</strong><small>${plan.subtitle}</small>${plan.badge ? `<span class="badge">${plan.badge}</span>` : ""}</span>
        <span class="price">${plan.rub} ₽</span>
    </button>`;
}

function uploadTile(kind, title, subtitle) {
    const file = state.files[kind];
    const preview = state.previews[kind];
    const hasImage = Boolean(file || preview);
    const toolId = kind.startsWith("tool-") ? kind.slice(5) : "";
    const icon = kind === "front" ? "camera" : kind === "body" ? "scan-line" : toolWorkspaces[toolId]?.icon || "scan";
    return `<label class="upload-tile ${hasImage ? "has-file" : ""}">
        ${preview ? `<img class="upload-preview" src="${preview}" alt="">` : ""}
        <input type="file" accept="image/png,image/jpeg" data-file="${kind}">
        <span class="upload-content">
            <span class="upload-icon"><i data-lucide="${icon}"></i></span>
            <h3>${file ? escapeHtml(file.name) : preview ? "Фото загружено" : title}</h3>
            <small class="muted">${subtitle}</small>
        </span>
    </label>`;
}

function viewForFeature(id) {
    if (id === "face") return "analysis";
    if (id === "body") return "body";
    if (toolWorkspaces[id]) return id;
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
        const kind = input.dataset.file;
        const file = event.target.files[0] || null;
        revokePreview(state.previews[kind]);
        state.files[kind] = file;
        state.previews[kind] = file ? URL.createObjectURL(file) : null;
        if (!file) localStorage.removeItem(storageKey(`preview-${kind}`));
        render();
        if (file) {
            persistPreview(kind, file);
        }
    }));
    document.querySelectorAll("[data-chat-chip]").forEach(button => button.addEventListener("click", () => sendChat(button.dataset.chatChip)));
    document.querySelectorAll("[data-guide]").forEach(button => button.addEventListener("click", () => {
        state.selectedGuide = button.dataset.guide;
        render();
        resetScroll();
    }));
    document.querySelectorAll("[data-guide-category]").forEach(button => button.addEventListener("click", () => {
        state.selectedGuideCategory = button.dataset.guideCategory;
        state.selectedGuide = null;
        render();
        resetScroll();
    }));
    document.querySelectorAll("[data-guide-track]").forEach(button => button.addEventListener("click", () => {
        state.guideTrack = button.dataset.guideTrack;
        state.selectedGuideCategory = "";
        state.selectedGuide = null;
        render();
    }));
    document.querySelectorAll("[data-goal]").forEach(button => button.addEventListener("click", () => {
        const profile = bodyProfileFromInputs();
        profile.goal = button.dataset.goal;
        state.bodyProfile = profile;
        state.bodyAnalysis = null;
        saveBodyProfile();
        saveBodyState();
        render();
    }));
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
    document.querySelectorAll("[data-plan-day]").forEach(button => button.addEventListener("click", () => {
        state.selectedPlanDay = Math.max(1, Math.min(60, Number(button.dataset.planDay) || 1));
        savePlanReports();
        render();
    }));
    document.querySelectorAll("[data-plan-task]").forEach(input => input.addEventListener("change", () => {
        togglePlanTask(Number(input.dataset.planTask), input.checked);
    }));
    document.querySelectorAll("[data-workout-exercise]").forEach(input => input.addEventListener("change", () => {
        togglePlanWorkoutExercise(Number(input.dataset.workoutExercise), input.checked);
    }));
    document.querySelectorAll("[data-plan-mood]").forEach(button => button.addEventListener("click", () => {
        if (!canEditPlanDay(selectedPlanDay())) {
            toast("Настроение можно менять только сегодня.");
            render();
            return;
        }
        const report = planReport(selectedPlanDay());
        report.mood = button.dataset.planMood;
        savePlanReports();
        render();
    }));
    document.querySelectorAll("[data-battle-opponent]").forEach(button => button.addEventListener("click", () => {
        state.battleOpponent = button.dataset.battleOpponent;
        state.battleResult = null;
        saveBattleState();
        render();
    }));
    document.querySelector("[data-toggle-nutrition-history]")?.addEventListener("click", async () => {
        state.nutritionHistoryOpen = !state.nutritionHistoryOpen;
        render();
        if (state.nutritionHistoryOpen && !state.nutritionHistory) {
            await loadNutritionHistory();
        }
    });
}

async function handleAction(event) {
    const action = event.currentTarget.dataset.action;
    blurActiveInput();
    if (action === "skip-onboarding") {
        finishOnboarding();
    }
    if (action === "prev-onboarding") {
        state.onboardingStep = Math.max(0, state.onboardingStep - 1);
        render();
        resetScroll();
    }
    if (action === "next-onboarding") {
        if (state.onboardingStep === onboarding.length - 1) finishOnboarding();
        else {
            state.onboardingStep += 1;
            render();
            resetScroll();
        }
    }
    if (action === "open-payment") {
        openPayment();
    }
    if (action === "analysis-next") {
        state.analysisStep = Math.min(3, Math.max(1, Number(state.analysisStep) || 1) + 1);
        render();
        resetScroll();
    }
    if (action === "analysis-back") {
        state.analysisStep = Math.max(1, Math.max(1, Number(state.analysisStep) || 1) - 1);
        render();
        resetScroll();
    }
    if (action === "run-analysis") {
        await runAnalysis();
    }
    if (action === "add-meal") {
        await addMeal();
    }
    if (action === "add-water") {
        addWater(Number(event.currentTarget.dataset.amount || 0));
    }
    if (action === "reset-water") {
        resetWater();
    }
    if (action === "ask-gpt") {
        setView("gpt");
        await sendChat(event.currentTarget.dataset.prompt || "Что делать сегодня?");
    }
    if (action === "save-body-profile") {
        saveBodyProfileFromView();
    }
    if (action === "run-body-analysis") {
        await runBodyAnalysis();
    }
    if (action === "run-tool-analysis") {
        await runToolAnalysis(event.currentTarget.dataset.toolId);
    }
    if (action === "add-tool-to-plan") {
        addToolToPlan(event.currentTarget.dataset.toolId);
    }
    if (action === "toggle-plan-tool") {
        togglePlanTool(event.currentTarget.dataset.toolId);
    }
    if (action === "back-guides") {
        state.selectedGuide = null;
        render();
        resetScroll();
    }
    if (action === "back-guide-categories") {
        state.selectedGuide = null;
        state.selectedGuideCategory = "";
        render();
        resetScroll();
    }
    if (action === "add-guide-to-plan") {
        addGuideToPlan(event.currentTarget.dataset.guideId);
    }
    if (action === "save-plan-report") {
        savePlanReport();
    }
    if (action === "run-battle") {
        await runBattle();
    }
    if (action === "add-admin") {
        await addAdmin();
    }
    if (action === "save-plan") {
        await saveAdminPlan(event.currentTarget.dataset.planCode);
    }
    if (action === "refresh-admin") {
        await loadAdmin();
        toast("Админка обновлена.");
    }
    if (action === "grant-subscription") {
        await grantSubscription();
    }
    if (action === "copy-admin-snapshot") {
        await copyAdminSnapshot();
    }
    if (action === "dismiss-access-notice") {
        state.accessNotice = null;
        render();
    }
}

function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "1");
    if (state.boot) state.boot.onboardingSeen = true;
    completeOnboardingRemote();
    setView("dashboard");
    resetScroll();
}

function setView(view) {
    state.view = view;
    closeDrawer();
    renderNav();
    render();
    resetScroll();
    if (view === "nutrition") loadNutrition();
    if (view === "admin") loadAdmin();
}

function resetScroll() {
    requestAnimationFrame(() => window.scrollTo(0, 0));
}

async function completeOnboardingRemote() {
    try {
        await api("/api/onboarding/complete", {
            method: "POST",
            body: JSON.stringify({})
        });
        if (state.boot) state.boot.onboardingSeen = true;
    } catch (_) {
        // LocalStorage still prevents repeated onboarding on this device.
    }
}

function renderNav() {
    const navRoot = document.querySelector("#drawerNav");
    const items = state.boot?.isAdmin ? [...nav, adminNavItem] : nav;
    navRoot.innerHTML = items.map(([view, label, icon]) => `<button class="nav-item ${state.view === view ? "active" : ""}" data-nav="${view}"><i data-lucide="${icon}"></i><span>${label}</span></button>`).join("");
    navRoot.querySelectorAll("[data-nav]").forEach(button => button.addEventListener("click", () => setView(button.dataset.nav)));
    refreshIcons();
}

async function runAnalysis() {
    if (state.busy.analysis) return;
    if (!canRunFaceAnalysis()) {
        if (!isPro() && hasUsedFreeFaceAnalysis()) {
            openPayment();
        } else {
            toast("Следующий скан откроется позже.");
        }
        return;
    }
    const form = new FormData();
    appendImageToForm(form, "front", state.files.front, state.previews.front);
    appendImageToForm(form, "side", state.files.side, state.previews.side);
    if (!state.files.front && !state.files.side && !state.previews.front && !state.previews.side) {
        toast("Добавь хотя бы одно фото.");
        return;
    }
    try {
        const previous = state.analysis;
        state.busy.analysis = true;
        state.analysisStep = 4;
        render();
        toast("Сканирую фото...");
        const response = await fetch(apiPath("/api/analysis"), {
            method: "POST",
            headers: { "X-Telegram-Init-Data": tg?.initData || "" },
            body: form
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Не удалось провести анализ");
        data.createdAt = new Date().toISOString();
        data.comparison = scanComparison(previous, data, "face");
        state.analysis = data;
        if (state.boot) state.boot.hasFaceAnalysis = true;
        state.analysisStep = 4;
        state.analysisHistory = [compactScan(data), ...state.analysisHistory].slice(0, 8);
        ensurePlanStartKey();
        state.selectedPlanDay = currentPlanDay();
        saveAnalysis();
        render();
        toast(isPro() ? "Анализ готов. Открой сегодняшний маршрут." : "Анализ готов.");
    } catch (error) {
        toast(error.message);
    } finally {
        state.busy.analysis = false;
        render();
    }
}

async function runBodyAnalysis() {
    if (state.busy.body) return;
    if (analysisCooldownRemaining("body") > 0) {
        toast("Следующая оценка формы откроется позже.");
        return;
    }
    const hasPhoto = Boolean(state.files.body || state.previews.body);
    state.bodyProfile = bodyProfileFromInputs();
    saveBodyProfile();
    if (!hasPhoto) {
        render();
        toast("Сначала загрузи фото формы.");
        return;
    }
    try {
        const previous = state.bodyAnalysis || state.bodyHistory[0] || null;
        state.busy.body = true;
        render();
        toast("Оцениваю форму...");
        await delay(820);
        const assessment = bodyAssessment(state.bodyProfile);
        const result = {
            ...assessment,
            profile: state.bodyProfile,
            comparison: scanComparison(previous, assessment, "body"),
            createdAt: new Date().toISOString()
        };
        state.bodyAnalysis = result;
        state.bodyHistory = [compactScan(result), ...state.bodyHistory].slice(0, 8);
        saveBodyState();
        render();
        toast(previous ? "Оценка обновлена." : "Оценка формы готова.");
    } catch (error) {
        toast(error.message);
    } finally {
        state.busy.body = false;
        render();
    }
}

async function runToolAnalysis(id) {
    const tool = toolWorkspaces[id];
    if (!tool || state.busy.tool) return;
    if (analysisCooldownRemaining(id) > 0) {
        toast("Следующий анализ откроется позже.");
        return;
    }
    const kind = toolUploadKind(id);
    if (!(state.files[kind] || state.previews[kind])) {
        toast("Сначала загрузи фото.");
        return;
    }
    const previous = state.toolReports[id] || state.toolHistory[id]?.[0] || null;
    try {
        state.busy.tool = id;
        render();
        toast("Анализирую фото...");
        let report = null;
        if (state.files[kind] || state.previews[kind]) {
            try {
                const form = new FormData();
                appendImageToForm(form, "photo", state.files[kind], state.previews[kind]);
                const response = await fetch(apiPath(`/api/analysis/tools/${id}`), {
                    method: "POST",
                    headers: { "X-Telegram-Init-Data": tg?.initData || "" },
                    body: form
                });
                const data = await response.json();
                if (response.ok) report = normalizeToolReport(id, tool, data);
            } catch (_) {
                report = null;
            }
        }
        if (!report) {
            await delay(780);
            report = toolAssessment(id, tool, previous);
        }
        report.comparison = scanComparison(previous, report, "tool");
        report.createdAt = new Date().toISOString();
        state.toolReports[id] = report;
        state.toolHistory[id] = [compactScan(report), ...(state.toolHistory[id] || [])].slice(0, 8);
        saveToolState();
        render();
        toast(previous ? "Оценка обновлена." : "Оценка готова.");
    } catch (error) {
        toast(error.message);
    } finally {
        state.busy.tool = "";
        render();
    }
}

async function sendChat(text) {
    if (state.busy.chat) return;
    const message = (text || "").trim();
    if (!message) return;
    blurActiveInput();
    const usage = chatUsageView();
    if (isPro() && usage.remaining <= 0) {
        toast("Лимит BodyGPT на сегодня исчерпан: 100 сообщений. Новый лимит откроется завтра.");
        return;
    }
    const history = chatHistoryForAi();
    state.chat.push({ role: "user", text: message });
    const assistant = { role: "assistant", text: "", pending: true };
    state.chat.push(assistant);
    state.busy.chat = true;
    saveChatHistory();
    render();
    scrollChatToBottom(true);
    const typer = createTypingRenderer(assistant);
    try {
        const response = await fetch(apiPath("/api/chat/stream"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Telegram-Init-Data": tg?.initData || ""
            },
            body: JSON.stringify({ message, history })
        });
        if (!response.ok || !response.body) {
            const error = await response.json().catch(() => ({ message: "Ошибка чата" }));
            throw new Error(error.message);
        }
        if (isPro()) {
            state.chatUsage.used = Math.min(usage.limit, Number(state.chatUsage.used || 0) + 1);
            state.chatUsage.remaining = Math.max(0, usage.limit - state.chatUsage.used);
            paintChatQuota();
        }
        await readSse(response, delta => {
            typer.push(delta);
        });
        await typer.waitForIdle();
    } catch (error) {
        assistant.pending = false;
        assistant.text = error.message;
        saveChatHistory();
        paintChatMessage(assistant);
        scrollChatToBottom(true);
    } finally {
        assistant.pending = false;
        state.busy.chat = false;
        saveChatHistory();
        if (state.view === "gpt" && paintChatMessage(assistant)) {
            unlockChatComposer();
            paintChatQuota();
            scrollChatToBottom(true);
        } else {
            render();
            scrollChatToBottom(true);
        }
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

async function loadNutritionHistory() {
    try {
        state.nutritionHistory = await api("/api/nutrition/history", { method: "GET" });
        if (state.view === "nutrition") render();
    } catch (error) {
        toast(error.message);
    }
}

async function addMeal() {
    if (state.busy.meal) return;
    if (!isPro()) {
        toast("AI-оценка КБЖУ доступна с BodyPro.");
        openPayment();
        return;
    }
    const input = document.querySelector("#mealInput");
    const text = input?.value?.trim();
    if (!text) {
        toast("Опиши приём пищи.");
        return;
    }
    blurActiveInput();
    try {
        state.busy.meal = true;
        render();
        toast("Считаю КБЖУ...");
        const [nutrition] = await Promise.all([
            api("/api/nutrition", {
                method: "POST",
                body: JSON.stringify({ mealType: state.mealType, text })
            }),
            delay(420)
        ]);
        state.nutrition = nutrition;
        state.nutritionHistory = null;
        render();
        toast("Добавлено в дневник.");
    } catch (error) {
        toast(error.message);
    } finally {
        state.busy.meal = false;
        render();
    }
}

async function loadAdmin() {
    if (!state.boot?.isAdmin) return;
    try {
        state.admin = await api("/api/admin", { method: "GET" });
        if (state.view === "admin") render();
    } catch (error) {
        toast(error.message);
    }
}

async function addAdmin() {
    const id = Number(document.querySelector("#adminTelegramId")?.value || 0);
    const note = document.querySelector("#adminNote")?.value || "";
    if (!id) {
        toast("Укажи Telegram ID.");
        return;
    }
    try {
        state.admin = await api("/api/admin/admins", {
            method: "POST",
            body: JSON.stringify({ telegramId: id, note })
        });
        render();
        toast("Админ добавлен.");
    } catch (error) {
        toast(error.message);
    }
}

async function grantSubscription() {
    const telegramId = Number(document.querySelector("#grantTelegramId")?.value || 0);
    const planCode = document.querySelector("#grantPlanCode")?.value || "intro";
    if (!telegramId) {
        toast("Укажи Telegram ID пользователя.");
        return;
    }
    try {
        await api("/api/admin/subscriptions/grant", {
            method: "POST",
            body: JSON.stringify({ telegramId, planCode })
        });
        state.admin = await api("/api/admin", { method: "GET" });
        render();
        toast("BodyPro выдан вручную.");
    } catch (error) {
        toast(error.message);
    }
}

async function saveAdminPlan(code) {
    const root = document.querySelector(`[data-admin-plan="${code}"]`);
    if (!root) return;
    const value = field => root.querySelector(`[data-field="${field}"]`)?.value || "";
    try {
        const updated = await api(`/api/admin/plans/${code}`, {
            method: "PATCH",
            body: JSON.stringify({
                rub: Number(value("rub")),
                stars: Number(value("stars")),
                usd: value("usd"),
                badge: value("badge")
            })
        });
        state.boot.plans = state.boot.plans.map(plan => plan.code === code ? updated : plan);
        if (state.admin?.plans) {
            state.admin.plans = state.admin.plans.map(plan => plan.code === code ? updated : plan);
        }
        render();
        toast("Тариф обновлён.");
    } catch (error) {
        toast(error.message);
    }
}

async function copyAdminSnapshot() {
    const stats = state.admin?.stats || {};
    const text = [
        "Сводка BodyLab",
        `Пользователи: ${stats.users || 0}`,
        `Активные Pro: ${stats.activeSubscriptions || 0}`,
        `Оплаченные платежи: ${stats.paidPayments || 0}`,
        `Выручка ₽: ${stats.rubRevenue || 0}`,
        `Выручка Stars: ${stats.starsRevenue || 0}`,
        `Выручка USDT: ${stats.usdRevenue || 0}`,
        `Анализы: ${stats.analyses || 0}`,
        `Питание: ${stats.meals || 0}`
    ].join("\n");
    try {
        await navigator.clipboard.writeText(text);
        toast("Сводка скопирована.");
    } catch (_) {
        toast("Не удалось скопировать.");
    }
}

function openPayment() {
    if (!state.boot.plans.some(plan => plan.code === state.selectedPlan)) {
        state.selectedPlan = preferredPlanCode();
    }
    updatePaymentModal();
    openModal("paymentModal");
}

function updatePaymentModal() {
    const plan = selectedPlan();
    const config = state.boot.payments;
    document.querySelector("#paymentTitle").textContent = plan.title;
    document.querySelector("#paymentSubtitle").textContent = state.busy.payment
        ? "Ожидаю подтверждение оплаты..."
        : "Выбери тариф и удобный способ оплаты.";
    document.querySelector("#paymentPlanSummary").innerHTML = `<div class="plan-list payment-plan-list">${state.boot.plans.map(paymentPlanCard).join("")}</div>`;
    setProviderSubtitle("stars", `${plan.stars} Stars · внутри Telegram`);
    setProviderSubtitle("crypto", `${formatUsd(plan.usd)} USDT · счёт в Crypto Bot`);
    setProviderSubtitle("card", `${plan.rub} ₽ · СБП/Карта/Юмани`);
    document.querySelector("[data-provider='stars']").disabled = state.busy.payment || !config.telegramStars;
    document.querySelector("[data-provider='crypto']").disabled = state.busy.payment || !config.cryptoPay;
    document.querySelector("[data-provider='card']").disabled = state.busy.payment || !config.card;
    document.querySelector("#demoActivateButton").style.display = config.demoMode ? "inline-flex" : "none";
    refreshIcons();
}

function setProviderSubtitle(provider, text) {
    const node = document.querySelector(`[data-provider='${provider}'] small`);
    if (node) node.textContent = text;
}

async function pay(provider) {
    if (state.busy.payment) return;
    const endpoint = { stars: "stars", crypto: "crypto", card: "card" }[provider];
    const plan = selectedPlan();
    try {
        setPaymentBusy(true);
        toast("Готовлю оплату...");
        const link = await api(`/api/payments/${endpoint}`, {
            method: "POST",
            body: JSON.stringify({ planCode: plan.code })
        });
        if (link.action === "open_invoice" && tg?.openInvoice) {
            tg.openInvoice(link.url, status => {
                if (status === "paid") {
                    waitForPaymentActivation(link.paymentId, plan, true);
                } else {
                    setPaymentBusy(false);
                    toast("Счёт закрыт: " + status);
                    bootstrap();
                }
            });
        } else if (link.action === "open_telegram_link" && tg?.openTelegramLink && isTelegramLink(link.url)) {
            tg.openTelegramLink(link.url);
            waitForPaymentActivation(link.paymentId, plan, false);
        } else if (link.action === "open_telegram_link" && tg?.openLink) {
            tg.openLink(link.url);
            waitForPaymentActivation(link.paymentId, plan, false);
        } else if (tg?.openLink) {
            tg.openLink(link.url);
            setPaymentBusy(false);
        } else {
            window.open(link.url, "_blank", "noopener");
            setPaymentBusy(false);
        }
    } catch (error) {
        setPaymentBusy(false);
        toast(error.message);
    }
}

async function waitForPaymentActivation(paymentId, plan, optimistic = false) {
    toast(optimistic ? "Оплата получена. Активирую доступ..." : "Счёт создан. Жду подтверждение оплаты...");
    for (let attempt = 0; attempt < 12; attempt += 1) {
        await delay(attempt < 2 ? 650 : 1000);
        try {
            const status = await api(`/api/payments/${paymentId}/status`, { method: "GET" });
            state.boot = await api("/api/bootstrap", { method: "GET" });
            if (status.subscriptionActive || state.boot.subscription?.active) {
                showAccessUnlocked(plan);
                toast("BodyPro активирован.");
                return;
            }
        } catch (_) {
            try {
                state.boot = await api("/api/bootstrap", { method: "GET" });
                if (state.boot.subscription?.active) {
                    showAccessUnlocked(plan);
                    toast("BodyPro активирован.");
                    return;
                }
            } catch (_) {}
        }
    }
    await bootstrap();
    setPaymentBusy(false);
    toast(optimistic
        ? "Оплата принята. Если доступ не появился, открой мини-апп заново через 10 секунд."
        : "Счёт создан. После оплаты доступ активируется автоматически.");
}

function setPaymentBusy(busy) {
    state.busy.payment = busy;
    if (document.querySelector("#paymentModal.open")) {
        updatePaymentModal();
    }
}

function showReturnPaymentNotice() {
    const paymentId = new URLSearchParams(window.location.search).get("payment");
    if (!paymentId || !state.boot?.subscription?.active) return null;
    const key = `bodylab:payment-notice:${paymentId}`;
    if (sessionStorage.getItem(key)) return null;
    const plan = state.boot.plans.find(item => item.code === state.boot.subscription.planCode) || selectedPlan();
    state.accessNotice = accessNoticeText(plan);
    state.view = "dashboard";
    sessionStorage.setItem(key, "1");
    window.history.replaceState(null, "", window.location.pathname);
    return plan;
}

function accessNoticeText(plan) {
    return `${plan.title}: открыты анализ лица, BodyGPT, питание, персональный план, академия и MogBattle.`;
}

function showAccessUnlocked(plan) {
    state.busy.payment = false;
    state.accessNotice = accessNoticeText(plan);
    closeModals();
    state.view = "dashboard";
    renderNav();
    render();
    openAccessModal(plan);
}

function openAccessModal(plan) {
    document.querySelector("#accessTitle").textContent = "BodyPro активирован";
    document.querySelector("#accessSubtitle").textContent = accessNoticeText(plan);
    openModal("accessModal");
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function activateDemo() {
    const plan = selectedPlan();
    try {
        await api("/api/payments/demo/activate", {
            method: "POST",
            body: JSON.stringify({ planCode: plan.code })
        });
        closeModals();
        await bootstrap();
        showAccessUnlocked(plan);
        toast("Демо-доступ активирован.");
    } catch (error) {
        toast(error.message);
    }
}

function buttonContent(label, busyLabel, icon, busy) {
    return busy ? `<span class="mini-loader"></span>${busyLabel}` : `<i data-lucide="${icon}"></i>${label}`;
}

function storageKey(name) {
    return `bodylab:${name}:${state.boot?.user?.telegramId || "guest"}`;
}

function loadLocalState() {
    state.chat = readJson(storageKey("chat"), []);
    state.planReports = readJson(storageKey("plan-reports"), {});
    state.planTools = readJson(storageKey("plan-tools"), []);
    if (!Array.isArray(state.planTools)) state.planTools = [];
    state.water = readJson(storageKey("water"), state.water);
    ensureWaterState();
    if (state.water.enabled && !state.planTools.includes("water")) {
        state.planTools.push("water");
        savePlanTools();
    }
    state.analysis = readJson(storageKey("analysis"), null);
    state.analysisHistory = readJson(storageKey("analysis-history"), []);
    state.previews.front = localStorage.getItem(storageKey("preview-front")) || null;
    state.previews.side = localStorage.getItem(storageKey("preview-side")) || null;
    state.previews.body = localStorage.getItem(storageKey("preview-body")) || null;
    Object.keys(toolWorkspaces).forEach(id => {
        const kind = toolUploadKind(id);
        state.previews[kind] = localStorage.getItem(storageKey(`preview-${kind}`)) || null;
    });
    state.bodyProfile = readJson(storageKey("body-profile"), null);
    state.bodyAnalysis = readJson(storageKey("body-analysis"), null);
    state.bodyHistory = readJson(storageKey("body-history"), []);
    if (!state.previews.body) {
        state.bodyAnalysis = null;
        state.bodyHistory = [];
    }
    state.toolReports = readJson(storageKey("tool-reports"), {});
    state.toolHistory = readJson(storageKey("tool-history"), {});
    Object.keys(toolWorkspaces).forEach(id => {
        if (!state.previews[toolUploadKind(id)]) {
            delete state.toolReports[id];
            delete state.toolHistory[id];
        }
    });
    state.selectedPlanDay = defaultPlanDay();
    const battle = readJson(storageKey("battle"), {});
    state.battleOpponent = battleOpponents.some(item => item.id === battle.opponent) ? battle.opponent : state.battleOpponent;
    const battleNames = new Set(battleOpponents.map(item => item.name));
    state.battleHistory = Array.isArray(battle.history) ? battle.history.filter(item => battleNames.has(item.name)).slice(0, 20) : [];
}

function readJson(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (_) {
        return fallback;
    }
}

function revokePreview(url) {
    if (url?.startsWith("blob:")) {
        URL.revokeObjectURL(url);
    }
}

async function persistPreview(kind, file) {
    try {
        const dataUrl = await createPreviewDataUrl(file);
        if (state.files[kind] !== file) return;
        revokePreview(state.previews[kind]);
        state.previews[kind] = dataUrl;
        localStorage.setItem(storageKey(`preview-${kind}`), dataUrl);
        render();
    } catch (_) {
        // The object URL preview still works for the current session.
    }
}

function createPreviewDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
            const image = new Image();
            image.onerror = reject;
            image.onload = () => {
                const maxSide = 900;
                const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.82));
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function appendImageToForm(form, field, file, preview) {
    if (file) {
        form.append(field, file);
        return;
    }
    const blob = dataUrlToBlob(preview);
    if (blob) form.append(field, blob, `${field}.jpg`);
}

function dataUrlToBlob(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith("data:")) return null;
    const parts = dataUrl.split(",");
    if (parts.length < 2) return null;
    const mime = /data:([^;]+)/.exec(parts[0])?.[1] || "image/jpeg";
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
}

function saveChatHistory() {
    if (!state.boot?.user) return;
    const compact = state.chat
        .filter(message => message.text && !message.pending)
        .slice(-MAX_CHAT_MESSAGES)
        .map(message => ({ role: message.role, text: cleanAssistantText(message.text).slice(0, 1600) }));
    localStorage.setItem(storageKey("chat"), JSON.stringify(compact));
}

function saveAnalysis() {
    if (!state.boot?.user || !state.analysis) return;
    localStorage.setItem(storageKey("analysis"), JSON.stringify(state.analysis));
    localStorage.setItem(storageKey("analysis-history"), JSON.stringify(state.analysisHistory));
}

function saveBodyState() {
    if (!state.boot?.user) return;
    if (state.bodyAnalysis) localStorage.setItem(storageKey("body-analysis"), JSON.stringify(state.bodyAnalysis));
    else localStorage.removeItem(storageKey("body-analysis"));
    localStorage.setItem(storageKey("body-history"), JSON.stringify(state.bodyHistory));
}

function saveToolState() {
    if (!state.boot?.user) return;
    localStorage.setItem(storageKey("tool-reports"), JSON.stringify(state.toolReports));
    localStorage.setItem(storageKey("tool-history"), JSON.stringify(state.toolHistory));
}

function chatHistoryForAi() {
    return state.chat
        .filter(message => message.text && !message.pending)
        .slice(-CHAT_CONTEXT_MESSAGES)
        .map(message => ({ role: message.role, text: cleanAssistantText(message.text).slice(0, 700) }));
}

function savePlanReports() {
    if (!state.boot?.user) return;
    localStorage.setItem(storageKey("plan-reports"), JSON.stringify(state.planReports));
}

function savePlanTools() {
    if (!state.boot?.user) return;
    localStorage.setItem(storageKey("plan-tools"), JSON.stringify(state.planTools));
}

function saveWaterState() {
    if (!state.boot?.user) return;
    localStorage.setItem(storageKey("water"), JSON.stringify(state.water));
}

function defaultPlanDay() {
    return currentPlanDay();
}

function selectedPlanDay() {
    if (!state.selectedPlanDay) state.selectedPlanDay = defaultPlanDay();
    return Math.max(1, Math.min(60, Number(state.selectedPlanDay) || 1));
}

function currentPlanDay() {
    if (!isPro()) return 1;
    const startKey = ensurePlanStartKey();
    return Math.max(1, Math.min(60, daysBetween(startKey, bodylabDayKey()) + 1));
}

function ensurePlanStartKey() {
    if (!state.boot?.user || !isPro()) return bodylabDayKey();
    const key = storageKey("plan-start-key");
    let startKey = localStorage.getItem(key);
    if (!startKey) {
        startKey = bodylabDayKey();
        localStorage.setItem(key, startKey);
    }
    return startKey;
}

function bodylabDayKey(date = new Date()) {
    return new Date(date.getTime() - BODYLAB_DAY_SHIFT_MS).toISOString().slice(0, 10);
}

function daysBetween(startKey, endKey) {
    return Math.floor((Date.parse(`${endKey}T00:00:00Z`) - Date.parse(`${startKey}T00:00:00Z`)) / 86400000);
}

function addDaysKey(startKey, days) {
    const date = new Date(Date.parse(`${startKey}T00:00:00Z`) + days * 86400000);
    return date.toISOString().slice(0, 10);
}

function planDayLabel(day) {
    const key = addDaysKey(ensurePlanStartKey(), day - 1);
    const [, month, date] = key.split("-");
    return `${date}.${month}`;
}

function dayStatusLabel(day, today) {
    if (day === today) return "Сегодня в работе";
    if (day < today) return "День завершён";
    return "Ближайший этап";
}

function canEditPlanDay(day) {
    return isPro() && day === currentPlanDay();
}

function startPlanClock() {
    if (planClockTimer) return;
    let currentKey = bodylabDayKey();
    planClockTimer = window.setInterval(() => {
        const previousToday = currentPlanDay();
        const nextKey = bodylabDayKey();
        if (nextKey === currentKey) return;
        const wasToday = selectedPlanDay() === previousToday;
        currentKey = nextKey;
        if (isPro()) {
            state.chatUsage = {
                ...chatUsageView(),
                used: 0,
                remaining: chatUsageView().limit
            };
            if (wasToday) state.selectedPlanDay = currentPlanDay();
            if (["dashboard", "plan", "gpt"].includes(state.view)) render();
        }
    }, 60000);
}

function renderPlanDayRail(day, today) {
    const start = Math.max(1, Math.min(60 - 6, day - 3));
    const days = Array.from({ length: 7 }, (_, index) => start + index);
    return `<div class="plan-day-rail">${days.map(item => `<button class="plan-day-chip ${item === day ? "active" : ""} ${item === today ? "today" : ""}" data-plan-day="${item}">
        <small>${planDayLabel(item)}</small>
        <strong>${item}</strong>
    </button>`).join("")}</div>`;
}

function renderPlanToolShelf(day, canEdit) {
    const tools = activePlanTools();
    if (!tools.length) return "";
    return `<div class="plan-tool-shelf">${tools.map(id => {
        if (id === "water") return waterTrackerHtml("plan");
        if (id === "body") {
            const workout = bodyWorkoutForPlanDay(day);
            return `<article class="plan-tool-card body">
                <span class="icon-shell"><i data-lucide="activity"></i></span>
                <div><strong>Body Max</strong><small>${workout ? "Тренировка в маршруте" : "Тренировочный блок появится по ритму плана"}</small></div>
                <button class="icon-button ghost" data-action="toggle-plan-tool" data-tool-id="body" aria-label="Убрать Body Max"><i data-lucide="check"></i></button>
            </article>`;
        }
        const tool = toolWorkspaces[id];
        if (!tool) return "";
        return `<article class="plan-tool-card">
            <span class="icon-shell"><i data-lucide="${tool.icon}"></i></span>
            <div><strong>${escapeHtml(tool.title)}</strong><small>${escapeHtml(tool.tasks?.[0] || "Фокус закреплён")}</small></div>
            <button class="icon-button ghost" data-action="toggle-plan-tool" data-tool-id="${id}" aria-label="Убрать из плана"><i data-lucide="check"></i></button>
        </article>`;
    }).join("")}</div>`;
}

function renderPlanNutritionTargets() {
    if (!planToolActive("body")) return "";
    const targets = nutritionTargets();
    return `<article class="plan-nutrition-card">
        <div>
            <p class="eyebrow">КБЖУ</p>
            <h3>${targets.calories} ккал</h3>
            <p class="muted">${targets.label}</p>
        </div>
        <div class="nutrition-mini-grid">
            <span><b>${targets.protein}г</b> белки</span>
            <span><b>${targets.fat}г</b> жиры</span>
            <span><b>${targets.carbs}г</b> углеводы</span>
        </div>
    </article>`;
}

function bodyWorkoutForPlanDay(day) {
    if (!planToolActive("body")) return null;
    const weekday = ((day - 1) % 7) + 1;
    const slot = { 1: 0, 3: 1, 5: 2 }[weekday];
    if (slot === undefined) return null;
    const assessment = state.bodyAnalysis || bodyAssessment(bodyProfile());
    const workout = assessment.trainingDays[slot];
    return workout ? { ...workout, routeDay: day, slot } : null;
}

function renderPlanWorkout(workout, report, canEdit) {
    const done = Array.isArray(report.workoutDone) ? report.workoutDone : [];
    return `<article class="plan-workout-card">
        <div class="training-day-head">
            <div><p class="eyebrow">Body Max</p><strong>${escapeHtml(workout.day)} · ${escapeHtml(workout.focus)}</strong></div>
            <span>день ${workout.routeDay}</span>
        </div>
        <div class="exercise-list">${workout.exercises.map((exercise, index) => `<label class="exercise-row plan-exercise ${done[index] ? "done" : ""}">
            <input type="checkbox" data-workout-exercise="${index}" ${done[index] ? "checked" : ""} ${canEdit ? "" : "disabled"}>
            <b>${escapeHtml(exercise.name)}</b>
            <em>${escapeHtml(exercise.sets)}</em>
            <small>${escapeHtml(exercise.technique)}</small>
        </label>`).join("")}</div>
    </article>`;
}

function planDayCompletion(day, report, workout = bodyWorkoutForPlanDay(day)) {
    const tasks = planTasksForReport(day, report);
    const taskDone = tasks.reduce((sum, _, index) => sum + (report.tasks?.[index] ? 1 : 0), 0);
    const exercises = workout?.exercises || [];
    const workoutDone = exercises.reduce((sum, _, index) => sum + (report.workoutDone?.[index] ? 1 : 0), 0);
    const total = tasks.length + exercises.length;
    const done = taskDone + workoutDone;
    const ratio = total ? done / total : 0;
    return { done, total, ratio, percent: Math.round(ratio * 100) };
}

function planPhase(day) {
    return planPhases.find(phase => day >= phase.from && day <= phase.to) || planPhases[0];
}

function planReport(day) {
    const key = String(day);
    if (!state.planReports[key]) {
        state.planReports[key] = {
            tasks: [],
            extraTasks: [],
            workoutDone: [],
            mood: "",
            note: "",
            completion: 0,
            updatedAt: ""
        };
    }
    if (!Array.isArray(state.planReports[key].extraTasks)) {
        state.planReports[key].extraTasks = [];
    }
    if (!Array.isArray(state.planReports[key].workoutDone)) {
        state.planReports[key].workoutDone = [];
    }
    const tasks = planTasksForReport(day, state.planReports[key]);
    if (state.planReports[key].tasks.length !== tasks.length) {
        state.planReports[key].tasks = tasks.map((_, index) => Boolean(state.planReports[key].tasks[index]));
    }
    return state.planReports[key];
}

function planTasksForReport(day, report) {
    const base = planPhase(day).tasks;
    const extra = Array.isArray(report?.extraTasks) ? report.extraTasks : [];
    return [...base, ...extra];
}

function togglePlanTask(index, checked) {
    const day = selectedPlanDay();
    if (!canEditPlanDay(day)) {
        toast("Отчёт можно менять только сегодня.");
        render();
        return;
    }
    const report = planReport(day);
    report.tasks[index] = checked;
    report.completion = planDayCompletion(day, report).ratio;
    report.updatedAt = new Date().toISOString();
    savePlanReports();
    render();
}

function togglePlanWorkoutExercise(index, checked) {
    const day = selectedPlanDay();
    if (!canEditPlanDay(day)) {
        toast("Тренировку можно отмечать только в её день.");
        render();
        return;
    }
    const report = planReport(day);
    const workout = bodyWorkoutForPlanDay(day);
    if (!workout) return;
    report.workoutDone = workout.exercises.map((_, itemIndex) => Boolean(report.workoutDone?.[itemIndex]));
    report.workoutDone[index] = checked;
    report.completion = planDayCompletion(day, report, workout).ratio;
    report.updatedAt = new Date().toISOString();
    savePlanReports();
    render();
}

function savePlanReport() {
    const day = selectedPlanDay();
    if (!canEditPlanDay(day)) {
        toast("Отчёт можно сохранить только сегодня.");
        return;
    }
    const report = planReport(day);
    report.note = document.querySelector("#planNote")?.value?.trim() || "";
    report.completion = planDayCompletion(day, report).ratio;
    report.updatedAt = new Date().toISOString();
    savePlanReports();
    render();
    toast("Отчёт дня сохранён.");
}

function planToolActive(id) {
    if (id === "water" && state.water?.enabled) return true;
    return Array.isArray(state.planTools) && state.planTools.includes(id);
}

function activePlanTools() {
    const ids = Array.isArray(state.planTools) ? state.planTools.slice() : [];
    if (state.water?.enabled && !ids.includes("water")) ids.push("water");
    return ids.filter((id, index) => ids.indexOf(id) === index);
}

function planToolTitle(id) {
    if (id === "body") return "Body Max";
    return toolWorkspaces[id]?.title || id;
}

function planToolIcon(id) {
    if (id === "body") return "activity";
    return toolWorkspaces[id]?.icon || "sparkles";
}

function planToggleHtml(id) {
    const active = planToolActive(id);
    return `<button class="plan-toggle-fab ${active ? "active" : ""}" data-action="toggle-plan-tool" data-tool-id="${id}" aria-label="${active ? "Убрать из плана" : "Добавить в план"}">
        <i data-lucide="${active ? "check" : "plus"}"></i>
    </button>`;
}

function planNudgeHtml(id) {
    if (planToolActive(id)) return "";
    return `<div class="plan-nudge" aria-hidden="true"><span>в план</span><i data-lucide="arrow-up-right"></i></div>`;
}

function setPlanTool(id, enabled) {
    state.planTools = Array.isArray(state.planTools) ? state.planTools : [];
    if (enabled && !state.planTools.includes(id)) {
        state.planTools.push(id);
    }
    if (!enabled) {
        state.planTools = state.planTools.filter(item => item !== id);
    }
    if (id === "water") {
        const water = ensureWaterState();
        water.enabled = enabled;
        saveWaterState();
    }
    savePlanTools();
}

function togglePlanTool(id) {
    if (!id) return;
    if (!isPro()) {
        openPayment();
        return;
    }
    const next = !planToolActive(id);
    setPlanTool(id, next);
    render();
    toast(next ? `${planToolTitle(id)} добавлен в план.` : `${planToolTitle(id)} убран из плана.`);
}

function addToolToPlan(id) {
    const tool = toolWorkspaces[id];
    if (!tool && id !== "body") return;
    if (!isPro()) {
        openPayment();
        return;
    }
    setPlanTool(id, true);
    state.selectedPlanDay = currentPlanDay();
    toast(`${planToolTitle(id)} закреплён в плане.`);
    setView("plan");
}

function addGuideToPlan(id) {
    const guide = guideLibrary.find(item => item.id === id);
    if (!guide) return;
    addExtraTaskToToday(`Гайд: применить одно правило “${guide.title}”`);
}

function addExtraTaskToToday(task) {
    if (!isPro()) {
        openPayment();
        return;
    }
    const day = currentPlanDay();
    const report = planReport(day);
    report.extraTasks = Array.isArray(report.extraTasks) ? report.extraTasks : [];
    if (!report.extraTasks.includes(task)) {
        report.extraTasks.push(task);
        report.tasks.push(false);
        report.updatedAt = new Date().toISOString();
        report.completion = planDayCompletion(day, report).ratio;
        savePlanReports();
        toast("Фокус добавлен в маршрут дня.");
    } else {
        toast("Этот фокус уже есть в сегодняшнем дне.");
    }
    state.selectedPlanDay = day;
    setView("plan");
}

function renderPlanReportList() {
    const reports = Object.entries(state.planReports)
        .filter(([, report]) => report.updatedAt)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .slice(0, 6);
    if (!reports.length) {
        return `<div class="admin-empty">Пока нет сохранённых отчётов. Отметь задачи дня и нажми “Сохранить отчёт дня”.</div>`;
    }
    return reports.map(([day, report]) => `<div class="zone-card report-card">
        <strong>День ${day}<em>${planDayCompletion(Number(day), report).percent}%</em></strong>
        <p class="muted">${escapeHtml(report.mood ? `${report.mood}. ` : "")}${escapeHtml(report.note || "Заметка не добавлена.")}</p>
    </div>`).join("");
}

function selectedBattleOpponent() {
    const id = state.battleResult?.opponentId || state.battleOpponent;
    const opponent = battleOpponents.find(item => item.id === id);
    if (opponent) return opponent;
    state.battleOpponent = battleOpponents[0].id;
    return battleOpponents[0];
}

function battleOwnScore() {
    if (state.analysis?.score) return Math.max(1, Math.min(100, Number(state.analysis.score)));
    if (state.files.front || state.previews.front) return 68;
    return 0;
}

async function runBattle() {
    if (state.busy.battle) return;
    const ownScore = battleOwnScore();
    if (!ownScore) {
        toast("Сначала загрузи фото или сделай анализ лица.");
        return;
    }
    state.busy.battle = true;
    render();
    await delay(720);
    const opponent = randomBattleOpponent();
    state.battleOpponent = opponent.id;
    const swing = Math.round((Math.random() - 0.5) * 8);
    const finalOwn = Math.max(1, Math.min(100, ownScore + swing));
    const delta = finalOwn - opponent.score;
    const result = Math.abs(delta) <= 3 ? "tie" : delta > 0 ? "win" : "lose";
    const eloDelta = result === "win" ? 18 : result === "tie" ? 4 : -12;
    state.battleResult = {
        result,
        opponentId: opponent.id,
        image: opponent.image,
        tier: opponent.tier,
        name: opponent.name,
        ownScore: finalOwn,
        opponentScore: opponent.score,
        eloDelta,
        advice: battleAdvice(result, delta)
    };
    state.battleHistory.unshift({ ...state.battleResult, createdAt: new Date().toISOString() });
    state.battleHistory = state.battleHistory.slice(0, 20);
    state.busy.battle = false;
    saveBattleState();
    render();
    toast(result === "win" ? "Победа в баттле." : result === "tie" ? "Почти ровно." : "Есть что усилить.");
}

function randomBattleOpponent() {
    if (battleOpponents.length <= 1) return battleOpponents[0];
    const lastId = state.battleResult?.opponentId || "";
    const pool = battleOpponents.filter(item => item.id !== lastId);
    return pool[Math.floor(Math.random() * pool.length)] || battleOpponents[0];
}

function battleElo() {
    return 800 + state.battleHistory.reduce((sum, item) => sum + item.eloDelta, 0);
}

function battleRank(elo) {
    if (elo >= 1080) return "Магнит";
    if (elo >= 1000) return "Фотогеник";
    if (elo >= 920) return "Контур";
    if (elo >= 840) return "База";
    return "Новичок";
}

function battleAdvice(result, delta) {
    if (result === "win") return "Твой общий визуальный уровень выше в этом сравнении: сильнее читаются лицо, свежесть, контур и образ.";
    if (result === "tie") return "Внешность близка по баллам. Решать будут кожа, стрижка, силуэт, стиль и качество основного фото.";
    return `Разрыв ${Math.abs(delta)} пунктов. Быстрый фокус: кожа, контур волос, силуэт, посадка одежды и более сильное фото.`;
}

function saveBattleState() {
    if (!state.boot?.user) return;
    localStorage.setItem(storageKey("battle"), JSON.stringify({
        opponent: state.battleOpponent,
        history: state.battleHistory
    }));
}

function chatMessageHtml(message) {
    const text = escapeHtml(formatChatText(message.text));
    const cursor = message.pending && text ? `<span class="typing-cursor"></span>` : "";
    const dots = message.pending && !text ? `<span class="typing-dots"><i></i><i></i><i></i></span>` : "";
    return `<div class="chat-message ${message.role} ${message.pending ? "is-pending" : ""}">${text || dots}${cursor}</div>`;
}

function createTypingRenderer(assistant) {
    return {
        queue: "",
        active: false,
        lastPaint: 0,
        idleResolvers: [],
        push(delta) {
            const cleanDelta = cleanAssistantText(delta);
            if (!cleanDelta) return;
            this.queue += cleanDelta;
            this.run();
        },
        async run() {
            if (this.active) return;
            this.active = true;
            while (this.queue.length) {
                const char = this.queue[0];
                this.queue = this.queue.slice(1);
                assistant.pending = true;
                assistant.text = cleanAssistantText(assistant.text + char);
                if (Date.now() - this.lastPaint > CHAT_RENDER_INTERVAL || /[\n.!?;:]$/.test(char)) {
                    this.paint();
                }
                await delay(chatCharDelay(char));
            }
            this.paint();
            this.active = false;
            this.resolveIdle();
        },
        paint() {
            this.lastPaint = Date.now();
            saveChatHistory();
            if (!paintChatMessage(assistant)) render();
            scrollChatToBottom();
        },
        waitForIdle() {
            if (!this.active && !this.queue.length) return Promise.resolve();
            return new Promise(resolve => this.idleResolvers.push(resolve));
        },
        resolveIdle() {
            this.idleResolvers.splice(0).forEach(resolve => resolve());
        }
    };
}

function paintChatMessage(message) {
    if (state.view !== "gpt") return false;
    const list = document.querySelector("#chatList");
    if (!list) return false;
    const messages = Array.from(list.querySelectorAll(".chat-message"));
    const element = messages[messages.length - 1];
    if (!element) return false;
    element.className = `chat-message ${message.role} ${message.pending ? "is-pending" : ""}`;
    const text = escapeHtml(formatChatText(message.text));
    const cursor = message.pending && text ? `<span class="typing-cursor"></span>` : "";
    const dots = message.pending && !text ? `<span class="typing-dots"><i></i><i></i><i></i></span>` : "";
    element.innerHTML = `${text || dots}${cursor}`;
    return true;
}

function paintChatQuota() {
    if (state.view !== "gpt") return;
    const node = document.querySelector(".chat-quota");
    if (!node) return;
    const usage = chatUsageView();
    node.textContent = `${usage.used}/${usage.limit}`;
    node.classList.toggle("low", usage.remaining <= 10);
}

function unlockChatComposer() {
    const input = document.querySelector("#chatInput");
    const button = document.querySelector("#chatForm .send-button");
    if (input) input.disabled = false;
    if (button) {
        button.disabled = false;
        button.innerHTML = `<i data-lucide="send"></i>`;
    }
    refreshIcons();
}

function chatCharDelay(char) {
    if (char === "\n") return CHAT_PUNCTUATION_DELAY;
    if (/[.!?]/.test(char)) return CHAT_PUNCTUATION_DELAY;
    if (/[,;:]/.test(char)) return Math.round(CHAT_PUNCTUATION_DELAY * 0.65);
    return CHAT_TYPE_DELAY + Math.round(Math.random() * 12);
}

function scrollChatToBottom(force = false) {
    const list = document.querySelector("#chatList");
    if (!list) return;
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (!force && distance > 180) return;
    if (chatScrollFrame) cancelAnimationFrame(chatScrollFrame);
    chatScrollFrame = requestAnimationFrame(() => {
        if (force) list.style.scrollBehavior = "auto";
        list.scrollTop = list.scrollHeight;
        if (force) {
            requestAnimationFrame(() => {
                list.style.scrollBehavior = "";
            });
        }
        chatScrollFrame = null;
    });
}

function cleanAssistantText(text) {
    return String(text || "")
        .replace(/\*\*/g, "")
        .replace(/^\s*\*\s+/gm, "- ")
        .replace(/\*/g, "");
}

function formatChatText(text) {
    return cleanAssistantText(text);
}

function cleanPublicText(text) {
    return String(text || "")
        .replace(/(?:ИИ|AI|искусственный интеллект)[^.?!]*(?:диагноз|диагнозы|медицин)[^.?!]*[.?!]?/giu, "")
        .replace(/не является медицинской рекомендацией[.?!]?/giu, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function gptWelcomeText() {
    if (isPro() && state.analysis?.score) {
        const day = currentPlanDay();
        const firstFocus = (state.analysis.zones || [])[0]?.name || "первый фокус";
        return `Я рядом. День ${day}: начнём с зоны “${firstFocus}”, отметим задачи дня и вечером зафиксируем короткий отчёт. Можешь спросить: “что делать прямо сейчас?”`;
    }
    if (isPro()) {
        return `Привет. Я BodyGPT — твой помощник по внешности. Сначала сделай анализ лица или Body Max, потом я соберу сканы, питание, тренировки и привычки в конкретные шаги.`;
    }
    return "Привет. Я BodyGPT — личный помощник по внешности. Полные ответы открываются с BodyPro.";
}

function chatUsageView() {
    const limit = Number(state.chatUsage?.limit || BODYGPT_DAILY_LIMIT);
    const used = Math.max(0, Number(state.chatUsage?.used || 0));
    return { limit, used, remaining: Math.max(0, limit - used) };
}

function blurActiveInput() {
    const element = document.activeElement;
    if (element && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)) {
        element.blur();
    }
}

function preferredPlanCode() {
    return state.boot?.plans?.find(plan => plan.code === "intro")?.code || state.boot?.plans?.[0]?.code || "intro";
}

function selectedPlan() {
    return state.boot.plans.find(plan => plan.code === state.selectedPlan) || state.boot.plans[0];
}

function formatUsd(value) {
    return Number(value || 0).toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function isTelegramLink(url) {
    return /^https:\/\/t\.me\//i.test(String(url || ""));
}

function isPro() {
    return Boolean(state.boot?.subscription?.active);
}

function canRunFaceAnalysis() {
    if (!isPro() && hasUsedFreeFaceAnalysis()) return false;
    return analysisCooldownRemaining("face") <= 0;
}

function isStyleMetric(name) {
    return /стиль|style|подач|гардероб|образ/i.test(String(name || ""));
}

function hasUsedFreeFaceAnalysis() {
    return Boolean(state.analysis || state.boot?.hasFaceAnalysis);
}

function featureCooldownRemaining(id) {
    if (id === "face") return analysisCooldownRemaining("face");
    if (id === "body") return analysisCooldownRemaining("body");
    if (toolWorkspaces[id]) return analysisCooldownRemaining(id);
    return 0;
}

function analysisCooldownRemaining(id) {
    const timestamp = analysisTimestamp(id);
    if (!timestamp) return 0;
    const cooldown = id === "body" ? BODY_ANALYSIS_COOLDOWN_MS : PHOTO_ANALYSIS_COOLDOWN_MS;
    return Math.max(0, timestamp + cooldown - Date.now());
}

function analysisTimestamp(id) {
    if (id === "face") return Date.parse(state.analysis?.createdAt || "") || 0;
    if (id === "body") return Date.parse(state.bodyAnalysis?.createdAt || "") || 0;
    return Date.parse(state.toolReports?.[id]?.createdAt || "") || 0;
}

function cooldownNotice(id) {
    const remaining = analysisCooldownRemaining(id);
    if (remaining <= 0) return "";
    return `<div class="cooldown-notice">
        <i data-lucide="timer"></i>
        <span>Следующее обновление через <b ${countdownAttrs(Date.now() + remaining)}>${formatDuration(remaining)}</b></span>
    </div>`;
}

function countdownAttrs(until, prefix = "") {
    return `data-countdown-until="${Math.round(until)}" data-countdown-prefix="${escapeHtml(prefix)}"`;
}

function startCountdownClock() {
    if (countdownTimer) return;
    countdownTimer = window.setInterval(updateCountdowns, 1000);
}

function updateCountdowns() {
    let shouldRefresh = false;
    document.querySelectorAll("[data-countdown-until]").forEach(node => {
        const remaining = Math.max(0, Number(node.dataset.countdownUntil || 0) - Date.now());
        node.textContent = `${node.dataset.countdownPrefix || ""}${formatDuration(remaining)}`;
        if (remaining <= 0) shouldRefresh = true;
    });
    if (shouldRefresh && state.view !== "gpt") {
        render();
    }
}

function formatDuration(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (days > 0) return `${days}д ${String(hours).padStart(2, "0")}ч`;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function pct(value, target) {
    return Math.round(Math.max(0, Math.min(100, (value / target) * 100)));
}

function compactScan(scan) {
    if (!scan) return null;
    return {
        score: Math.max(0, Math.min(100, Number(scan.score) || 0)),
        title: scan.title || "",
        summary: scan.summary || "",
        metrics: Array.isArray(scan.metrics) ? scan.metrics.slice(0, 8) : [],
        createdAt: scan.createdAt || new Date().toISOString()
    };
}

function scanComparison(previous, current, type) {
    if (!current) return null;
    const currentScore = Math.max(0, Math.min(100, Number(current.score) || 0));
    if (!previous?.score) {
        return {
            kind: "first",
            title: "Точка отсчёта",
            delta: 0,
            summary: type === "body"
                ? "Сохрани эту оценку как старт. Следующий скан покажет изменения по форме, талии, массе и регулярности тренировок."
                : "Сохрани этот результат как старт. Следующий скан покажет, что изменилось в коже, контуре, фото и подаче.",
            better: [],
            attention: [],
            planShift: "Первый фокус уже добавлен в ближайшие действия."
        };
    }
    const previousScore = Math.max(0, Math.min(100, Number(previous.score) || 0));
    const delta = currentScore - previousScore;
    const currentMetrics = metricMap(current.metrics);
    const previousMetrics = metricMap(previous.metrics);
    const changes = Object.entries(currentMetrics)
        .map(([name, value]) => ({ name, value, delta: value - (previousMetrics[name] ?? value) }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const better = changes.filter(item => item.delta > 1).slice(0, 2);
    const attention = changes.filter(item => item.delta < -1).slice(0, 2);
    const focus = attention[0] || changes.find(item => item.value < 70) || changes[0];
    return {
        kind: delta > 1 ? "up" : delta < -1 ? "down" : "stable",
        title: delta > 1 ? "Стало лучше" : delta < -1 ? "Нужно вернуть темп" : "Держишь уровень",
        delta,
        summary: comparisonSummary(delta, type),
        better,
        attention,
        planShift: focus
            ? `Фокус на ближайшие дни: ${focus.name.toLowerCase()}.`
            : "План можно продолжать без резких изменений."
    };
}

function metricMap(metrics) {
    const map = {};
    if (!Array.isArray(metrics)) return map;
    metrics.forEach(item => {
        const name = String(item.name || "").trim();
        if (!name) return;
        map[name] = Math.max(0, Math.min(100, Number(item.value) || 0));
    });
    return map;
}

function comparisonSummary(delta, type) {
    const area = type === "body" ? "форма" : "внешность";
    if (delta > 1) return `${area[0].toUpperCase()}${area.slice(1)} выглядит сильнее: общий балл вырос на ${delta}.`;
    if (delta < -1) return `Общий балл снизился на ${Math.abs(delta)}. Это повод упростить план и вернуть базовые действия.`;
    return "Серьёзного скачка нет, но стабильность тоже результат. Продолжай копить маленькие улучшения.";
}

function renderScanComparison(comparison) {
    if (!comparison) return "";
    const deltaText = comparison.delta > 0 ? `+${comparison.delta}` : String(comparison.delta || 0);
    const better = Array.isArray(comparison.better) ? comparison.better : [];
    const attention = Array.isArray(comparison.attention) ? comparison.attention : [];
    return `<article class="scan-comparison ${comparison.kind || "stable"}">
        <div class="scan-comparison-head">
            <span class="icon-shell"><i data-lucide="${comparison.kind === "up" ? "trending-up" : comparison.kind === "down" ? "trending-down" : "activity"}"></i></span>
            <div>
                <p class="eyebrow">Динамика</p>
                <h3>${escapeHtml(comparison.title)}</h3>
            </div>
            <strong>${deltaText}</strong>
        </div>
        <p class="muted">${escapeHtml(comparison.summary)}</p>
        <div class="scan-change-grid">
            <div><small>Лучше</small>${better.length ? better.map(item => `<span>${escapeHtml(item.name)} +${item.delta}</span>`).join("") : `<span>держится стабильно</span>`}</div>
            <div><small>Внимание</small>${attention.length ? attention.map(item => `<span>${escapeHtml(item.name)} ${item.delta}</span>`).join("") : `<span>без резкой просадки</span>`}</div>
        </div>
        <div class="plan-adjustment"><i data-lucide="route"></i><span>${escapeHtml(comparison.planShift)}</span></div>
    </article>`;
}

function toolUploadKind(id) {
    return `tool-${id}`;
}

function toolAssessment(id, tool, previous) {
    const names = (tool.metrics || []).map(([name]) => name);
    const count = (state.toolHistory[id] || []).length;
    const baseSeed = Math.abs(hashString(`${id}:${state.boot?.user?.telegramId || "guest"}:${count}:${Date.now()}`));
    const metrics = names.map((name, index) => {
        const previousValue = metricMap(previous?.metrics)[name];
        const raw = 54 + ((baseSeed + index * 17) % 35);
        const value = previousValue
            ? clampPercent(previousValue + (((baseSeed >> (index + 1)) % 17) - 8))
            : clampPercent(raw);
        return { name, value, hint: toolMetricHint(value) };
    });
    const score = Math.round(metrics.reduce((sum, item) => sum + item.value, 0) / Math.max(1, metrics.length));
    const strongest = metrics.slice().sort((a, b) => b.value - a.value)[0];
    const weakest = metrics.slice().sort((a, b) => a.value - b.value)[0];
    return {
        score,
        title: score >= 82 ? "Сильный блок" : score >= 66 ? "Хорошая база" : "Есть быстрые победы",
        headline: toolHeadline(id, score),
        summary: `${strongest.name} выглядит сильнее всего. Ближайший фокус — ${weakest.name.toLowerCase()}.`,
        metrics,
        tasks: toolTasksFor(id, tool, weakest?.name),
        planText: `Добавь фокус “${weakest.name}” в отчёт дня и повтори фото после 3-5 действий.`
    };
}

function normalizeToolReport(id, tool, data) {
    const fallback = toolAssessment(id, tool, null);
    const metrics = Array.isArray(data.metrics)
        ? data.metrics.map((item, index) => ({
            name: item.name || fallback.metrics[index]?.name || `Метрика ${index + 1}`,
            value: clampPercent(item.value),
            hint: cleanPublicText(item.hint || toolMetricHint(clampPercent(item.value)))
        })).slice(0, 5)
        : fallback.metrics;
    const score = clampPercent(data.score || Math.round(metrics.reduce((sum, item) => sum + item.value, 0) / Math.max(1, metrics.length)));
    return {
        score,
        title: cleanPublicText(data.title || fallback.title),
        headline: cleanPublicText(data.headline || fallback.headline),
        summary: cleanPublicText(data.summary || fallback.summary),
        metrics,
        tasks: Array.isArray(data.tasks) && data.tasks.length
            ? data.tasks.map(item => cleanPublicText(item)).filter(Boolean).slice(0, 4)
            : fallback.tasks,
        planText: cleanPublicText(data.planText || fallback.planText)
    };
}

function toolHeadline(id, score) {
    const map = {
        skin: score >= 70 ? "Кожа выглядит стабильнее" : "Коже нужна база",
        hair: score >= 70 ? "Контур читается лучше" : "Контур стоит усилить",
        sleep: score >= 70 ? "Лицо выглядит свежее" : "Восстановление просит внимания",
        water: score >= 70 ? "Свежесть держится" : "Отёки и тон требуют режима",
        style: score >= 70 ? "Образ собран" : "Образу нужна чистая форма",
        photo: score >= 70 ? "Фото работает на тебя" : "Фото можно сильно усилить",
        wardrobe: score >= 70 ? "Гардероб собраннее" : "Гардероб просит структуры",
        looks: score >= 70 ? "Подача стала понятнее" : "Архетип ещё не собран"
    };
    return map[id] || "Разбор готов";
}

function toolTasksFor(id, tool, focus) {
    const base = Array.isArray(tool.tasks) ? tool.tasks.slice(0, 3) : [];
    const extra = {
        skin: `Сделай одно фото кожи вечером и сравни ${focus?.toLowerCase() || "тон"}.`,
        hair: `Сохрани один референс и сравни линию ${focus?.toLowerCase() || "контура"}.`,
        sleep: "Отметь утром лицо, энергию и отёки одним коротким комментарием.",
        water: "Разнеси воду по дню и вечером отметь соль/отёки.",
        style: "Сними этот образ ещё раз при дневном свете и убери лишний акцент.",
        photo: "Повтори кадр с камерой на уровне глаз и мягким боковым светом.",
        wardrobe: "Собери второй образ на той же базе и сравни посадку.",
        looks: "Выбери один референс подачи и повтори только свет, волосы или позу."
    }[id];
    return extra ? [...base, extra].slice(0, 4) : base;
}

function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function bodyProfile() {
    return state.bodyProfile || {
        height: state.settings.gender === "female" ? 165 : 180,
        weight: state.settings.gender === "female" ? 58 : 78,
        waist: state.settings.gender === "female" ? 70 : 84,
        workouts: 3,
        goal: "recomp"
    };
}

function bodyProfileFromInputs() {
    const current = bodyProfile();
    return {
        height: clampNumber(document.querySelector("#bodyHeight")?.value, 130, 230, current.height),
        weight: clampNumber(document.querySelector("#bodyWeight")?.value, 35, 180, current.weight),
        waist: clampNumber(document.querySelector("#bodyWaist")?.value, 45, 180, current.waist),
        workouts: clampNumber(document.querySelector("#bodyWorkouts")?.value, 0, 7, current.workouts),
        goal: current.goal || "recomp"
    };
}

function saveBodyProfileFromView() {
    blurActiveInput();
    state.bodyProfile = bodyProfileFromInputs();
    saveBodyProfile();
    render();
    toast("План тела обновлён.");
}

function saveBodyProfile() {
    if (!state.boot?.user || !state.bodyProfile) return;
    localStorage.setItem(storageKey("body-profile"), JSON.stringify(state.bodyProfile));
}

function bodyAssessment(profile) {
    const heightM = profile.height / 100;
    const bmi = profile.weight / Math.max(1, heightM * heightM);
    const waistRatio = profile.waist / profile.height;
    const bmiScore = 100 - Math.abs(bmi - 22.5) * 7;
    const waistScore = 100 - Math.abs(waistRatio - 0.45) * 180;
    const workoutScore = Math.min(100, 44 + profile.workouts * 10);
    const score = Math.round(Math.max(35, Math.min(96, bmiScore * 0.42 + waistScore * 0.38 + workoutScore * 0.2)));
    const activity = 1.2 + Math.min(0.55, profile.workouts * 0.08);
    const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * state.settings.age + (state.settings.gender === "female" ? -161 : 5);
    const delta = profile.goal === "muscle" ? 240 : profile.goal === "cut" ? -360 : -80;
    const calories = Math.round((bmr * activity + delta) / 25) * 25;
    const protein = Math.round(profile.weight * (profile.goal === "cut" ? 2.2 : 2));
    const title = score >= 82 ? "Сильная форма" : score >= 65 ? "Хорошая база" : "Нужна система";
    const goalTitle = profile.goal === "muscle" ? "Мягкий набор массы" : profile.goal === "cut" ? "Контролируемое похудение" : "Рекомпозиция";
    const bodyFocus = profile.goal === "muscle"
        ? "Фокус: прогресс в упражнениях, регулярный белок и спокойный набор без лишней спешки."
        : profile.goal === "cut"
            ? "Фокус: ровный дефицит, шаги, белок и контроль талии без резких откатов."
            : "Фокус: держать вес спокойнее, усиливать силуэт и постепенно подтягивать режим.";
    return {
        score,
        title,
        summary: `${goalTitle}. ${bodyFocus}`,
        metrics: [
            { name: "Силуэт", value: Math.round(Math.max(35, Math.min(96, waistScore * 0.72 + bmiScore * 0.28))) },
            { name: "Масса", value: Math.round(Math.max(35, Math.min(96, bmiScore))) },
            { name: "Режим", value: Math.round(workoutScore) }
        ],
        planTitle: goalTitle,
        calories,
        protein,
        pace: profile.goal === "muscle" ? "+0.2-0.4 кг" : profile.goal === "cut" ? "-0.4-0.7 кг" : "стабильно",
        trainingTitle: profile.workouts >= 4 ? "4 дня нагрузки" : "3 дня нагрузки",
        trainingDays: trainingDaysFor(profile),
        tracking: ["Вес 3 раза в неделю, смотреть среднее.", "Талия утром 1 раз в неделю.", "Фото тела каждые 14 дней в одинаковом свете."]
    };
}

function trainingDaysFor(profile) {
    const hard = profile.goal === "muscle";
    const lean = profile.goal === "cut";
    const base = [
        {
            day: "День 1",
            focus: "Ноги + корпус",
            exercises: [
                { name: "Приседания", sets: hard ? "5 x 10-15" : "4 x 14-20", technique: "Колени смотрят туда же, куда носки; спина длинная; вниз спокойно, вверх мощно." },
                { name: "Выпады назад", sets: "4 x 10 на ногу", technique: "Шаг назад мягкий, корпус ровный, передняя пятка не отрывается." },
                { name: "Ягодичный мост", sets: "4 x 15-20", technique: "Вверху сожми ягодицы на секунду, поясницу не переразгибай." },
                { name: "Планка", sets: lean ? "4 x 35-50 сек" : "3 x 35-45 сек", technique: "Рёбра подтянуты, таз не провисает, шея продолжает линию спины." }
            ]
        },
        {
            day: "День 2",
            focus: "Грудь + спина",
            exercises: [
                { name: "Отжимания", sets: hard ? "5 x максимум - 2" : "4 x 8-15", technique: "Локти под углом, корпус одной линией, грудь идёт к полу." },
                { name: "Лодочка", sets: "4 x 12-16", technique: "Поднимай грудь и ноги мягко, не зажимай шею, пауза наверху." },
                { name: "Обратные снежные ангелы", sets: "3 x 10-14", technique: "Лопатки ведут движение, плечи не поднимай к ушам." },
                { name: "Скручивания", sets: lean ? "4 x 16-24" : "3 x 12-18", technique: "Подбородок свободен, поясница прижата, движение короткое и контролируемое." }
            ]
        },
        {
            day: "День 3",
            focus: "Силуэт + выносливость",
            exercises: [
                { name: "Сплит-присед", sets: "4 x 8-12 на ногу", technique: "Опускайся вертикально, переднее колено стабильно, темп ровный." },
                { name: "Пайк-отжимания", sets: hard ? "4 x 6-10" : "3 x 6-10", technique: "Таз выше плеч, голова идёт к полу, локти не разваливаются." },
                { name: "Альпинист", sets: lean ? "5 x 30 сек" : "4 x 25 сек", technique: "Корпус тихий, колено тянется к груди, не раскачивай таз." },
                { name: "Боковая планка", sets: "3 x 25-40 сек на сторону", technique: "Локоть под плечом, корпус вытянут, таз не падает." }
            ]
        }
    ];
    if (profile.workouts >= 4) {
        base.push({
            day: "День 4",
            focus: "Повтор слабых зон",
            exercises: [
                { name: "Медленные приседания", sets: "4 x 10-14", technique: "Три секунды вниз, пауза внизу, подъём без рывка." },
                { name: "Отжимания узким упором", sets: "4 x 6-12", technique: "Локти ближе к корпусу, плечи опущены, корпус не ломается." },
                { name: "Супермен с паузой", sets: "4 x 10-14", technique: "Подъём небольшой, пауза наверху, поясница без боли." },
                { name: "Берпи без прыжка", sets: lean ? "4 x 10-14" : "3 x 8-10", technique: "Движение чистое: шаг в упор, ровная планка, подъём через стопы." }
            ]
        });
    }
    return base;
}

function clampNumber(value, min, max, fallback) {
    const number = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

function toolMetricHint(value) {
    return value >= 75 ? "сильно" : value >= 60 ? "норм" : "фокус";
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
    document.addEventListener("pointerdown", event => {
        if (!event.target.closest("input, textarea, select, label.upload-tile, .composer")) {
            blurActiveInput();
        }
    });
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
        const planButton = event.target.closest("[data-payment-plan]");
        if (planButton && !state.busy.payment) {
            state.selectedPlan = planButton.dataset.paymentPlan;
            updatePaymentModal();
            return;
        }
        const method = event.target.closest("[data-provider]");
        if (method && !method.disabled) pay(method.dataset.provider);
        if (event.target.id === "paymentModal") closeModals();
    });
    document.querySelector("#accessModal").addEventListener("click", event => {
        if (event.target.id === "accessModal") closeModals();
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
    blurActiveInput();
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

function formatDate(value) {
    if (!value) return "";
    try {
        return new Intl.DateTimeFormat("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    } catch (_) {
        return value;
    }
}

function formatCompact(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return "0";
    return new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: number >= 100 ? 0 : 2,
        notation: number >= 10000 ? "compact" : "standard"
    }).format(number);
}

initTelegram();
bindGlobal();
bootstrap();
