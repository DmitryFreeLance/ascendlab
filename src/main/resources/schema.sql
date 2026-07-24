CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    username VARCHAR(255),
    language_code VARCHAR(16),
    photo_url VARCHAR(1024),
    gender VARCHAR(32) DEFAULT 'male',
    age INT DEFAULT 25,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
    telegram_id BIGINT PRIMARY KEY,
    plan_code VARCHAR(32) NOT NULL,
    active_until TIMESTAMP NOT NULL,
    source VARCHAR(32) NOT NULL,
    payment_id VARCHAR(64),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    plan_code VARCHAR(32) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    amount VARCHAR(64) NOT NULL,
    currency VARCHAR(16) NOT NULL,
    external_id VARCHAR(128),
    status VARCHAR(32) NOT NULL,
    url VARCHAR(2048),
    payload CLOB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analysis_reports (
    id VARCHAR(64) PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    score INT NOT NULL,
    report_json CLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nutrition_logs (
    id VARCHAR(64) PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    meal_type VARCHAR(32) NOT NULL,
    title VARCHAR(512) NOT NULL,
    calories INT NOT NULL,
    protein INT NOT NULL,
    fat INT NOT NULL,
    carbs INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
    telegram_id BIGINT PRIMARY KEY,
    note VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plan_settings (
    code VARCHAR(32) PRIMARY KEY,
    rub INT NOT NULL,
    stars INT NOT NULL,
    usd DECIMAL(12, 2) NOT NULL,
    badge VARCHAR(64),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
