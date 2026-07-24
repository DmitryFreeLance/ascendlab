package lab.ascend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String publicUrl,
        boolean demoMode,
        String dataDir,
        String adminTelegramIds,
        Telegram telegram,
        Ai ai,
        Payments payments
) {
    public String miniAppUrl() {
        return trimSlash(publicUrl);
    }

    public String telegramWebhookUrl() {
        return trimSlash(publicUrl) + "/api/telegram/webhook/" + telegram.webhookSecret();
    }

    public String cryptoWebhookUrl() {
        return trimSlash(publicUrl) + "/api/payments/crypto/webhook/" + payments.cryptoPayWebhookSecret();
    }

    public String yookassaWebhookUrl() {
        return trimSlash(publicUrl) + "/api/payments/yookassa/webhook/" + payments.yookassaWebhookSecret();
    }

    private static String trimSlash(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    public record Telegram(
            String botToken,
            String botUsername,
            String webhookSecret,
            boolean registerWebhook,
            boolean longPolling
    ) {
        public boolean configured() {
            return botToken != null && !botToken.isBlank();
        }
    }

    public record Ai(
            String kieApiKey,
            String kieApiUrl
    ) {
        public boolean configured() {
            return kieApiKey != null && !kieApiKey.isBlank();
        }
    }

    public record Payments(
            String cryptoPayToken,
            String cryptoPayBaseUrl,
            String cryptoPayWebhookSecret,
            String yookassaShopId,
            String yookassaSecretKey,
            String yookassaApiUrl,
            String yookassaWebhookSecret
    ) {
        public boolean cryptoConfigured() {
            return cryptoPayToken != null && !cryptoPayToken.isBlank();
        }

        public boolean yookassaConfigured() {
            return yookassaShopId != null && !yookassaShopId.isBlank()
                    && yookassaSecretKey != null && !yookassaSecretKey.isBlank();
        }

        public boolean cardConfigured() {
            return yookassaConfigured();
        }
    }
}
