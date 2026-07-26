package lab.ascend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lab.ascend.config.AppProperties;
import lab.ascend.domain.PaymentStatus;
import lab.ascend.domain.PlanOffer;
import lab.ascend.repo.PaymentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Service
public class TelegramBotService implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(TelegramBotService.class);

    private final AppProperties properties;
    private final ObjectMapper objectMapper;
    private final PaymentRepository payments;
    private final SubscriptionService subscriptions;
    private final PlanCatalogService plans;
    private final RestClient restClient;
    private volatile boolean polling;
    private volatile long lastUpdateId;
    private Thread pollingThread;

    public TelegramBotService(AppProperties properties,
                              ObjectMapper objectMapper,
                              PaymentRepository payments,
                              SubscriptionService subscriptions,
                              PlanCatalogService plans) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.payments = payments;
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.restClient = RestClient.create();
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!properties.telegram().configured()) {
            log.info("Telegram bot token is not configured; bot API calls are disabled.");
            return;
        }
        setChatMenuButton();
        if (properties.telegram().longPolling()) {
            deleteWebhook();
            startLongPolling();
        } else if (properties.telegram().registerWebhook()) {
            setWebhook();
        }
    }

    public String createStarsInvoiceLink(long telegramId, PlanOffer plan, String paymentId) {
        Map<String, Object> body = Map.of(
                "title", "BodyLab - " + plan.title(),
                "description", "Доступ к BodyPro: анализ лица, BodyGPT, питание, академия и MogBattle.",
                "payload", paymentId + ":" + telegramId + ":" + plan.code(),
                "provider_token", "",
                "currency", "XTR",
                "prices", List.of(Map.of("label", plan.title(), "amount", plan.stars()))
        );
        JsonNode response = call("createInvoiceLink", body);
        return response.path("result").asText();
    }

    public void handleUpdate(JsonNode update) {
        JsonNode preCheckout = update.path("pre_checkout_query");
        if (!preCheckout.isMissingNode()) {
            answerPreCheckout(preCheckout.path("id").asText(), true, null);
            return;
        }
        JsonNode message = update.path("message");
        if (message.isMissingNode()) {
            return;
        }
        if (message.has("successful_payment")) {
            handleSuccessfulPayment(message);
            return;
        }
        String text = message.path("text").asText("");
        long chatId = message.path("chat").path("id").asLong();
        if (text.startsWith("/start")) {
            sendStart(chatId);
        } else if (text.startsWith("/paysupport")) {
            sendPaySupport(chatId);
        }
    }

    private void handleSuccessfulPayment(JsonNode message) {
        JsonNode payment = message.path("successful_payment");
        String payload = payment.path("invoice_payload").asText("");
        String[] parts = payload.split(":");
        if (parts.length < 3) {
            log.warn("Successful payment with unknown payload: {}", payload);
            return;
        }
        String paymentId = parts[0];
        long telegramId = Long.parseLong(parts[1]);
        PlanOffer plan = plans.get(parts[2]);
        payments.markStatus(paymentId, PaymentStatus.PAID, payment.path("telegram_payment_charge_id").asText(null), payment.toString());
        subscriptions.activate(telegramId, plan, "telegram_stars", paymentId);
        log.info("Telegram Stars payment {} activated BodyPro for {}", paymentId, telegramId);
        sendMessage(message.path("chat").path("id").asLong(),
                "Оплата прошла. BodyPro активирован: анализ лица, BodyGPT, питание, персональный план и академия уже открыты.");
    }

    private void sendStart(long chatId) {
        Map<String, Object> replyMarkup = Map.of("inline_keyboard", List.of(
                List.of(Map.of(
                        "text", "Открыть BodyLab",
                        "web_app", Map.of("url", properties.miniAppUrl())
                )),
                List.of(Map.of(
                        "text", "Тех. поддержка",
                        "url", "https://t.me/i3_14_2shokk"
                ))
        ));
        Map<String, Object> body = Map.of(
                "chat_id", chatId,
                "text", "BodyLab готов. Нажми кнопку ниже, чтобы открыть мини-приложение.",
                "reply_markup", replyMarkup
        );
        call("sendMessage", body);
    }

    private void sendPaySupport(long chatId) {
        sendMessage(chatId, "Поддержка BodyLab: напишите @i3_14_2shokk и приложите номер платежа, если вопрос по оплате.");
    }

    private void sendMessage(long chatId, String text) {
        call("sendMessage", Map.of("chat_id", chatId, "text", text));
    }

    private void answerPreCheckout(String id, boolean ok, String errorMessage) {
        Map<String, Object> body = errorMessage == null
                ? Map.of("pre_checkout_query_id", id, "ok", ok)
                : Map.of("pre_checkout_query_id", id, "ok", ok, "error_message", errorMessage);
        call("answerPreCheckoutQuery", body);
    }

    private void setChatMenuButton() {
        try {
            call("setChatMenuButton", Map.of(
                    "menu_button", Map.of(
                            "type", "web_app",
                            "text", "BodyLab",
                            "web_app", Map.of("url", properties.miniAppUrl())
                    )
            ));
        } catch (Exception ex) {
            log.warn("Unable to set Telegram menu button: {}", ex.getMessage());
        }
    }

    private void setWebhook() {
        try {
            call("setWebhook", Map.of(
                    "url", properties.telegramWebhookUrl(),
                    "allowed_updates", List.of("message", "pre_checkout_query")
            ));
        } catch (Exception ex) {
            log.warn("Unable to register Telegram webhook: {}", ex.getMessage());
        }
    }

    private void deleteWebhook() {
        try {
            call("deleteWebhook", Map.of("drop_pending_updates", false));
            log.info("Telegram webhook deleted; long polling can receive updates.");
        } catch (Exception ex) {
            log.warn("Unable to delete Telegram webhook before long polling: {}", ex.getMessage());
        }
    }

    private void startLongPolling() {
        if (pollingThread != null && pollingThread.isAlive()) {
            return;
        }
        polling = true;
        pollingThread = new Thread(this::pollLoop, "telegram-long-polling");
        pollingThread.setDaemon(true);
        pollingThread.start();
        log.info("Telegram long polling started.");
    }

    private void pollLoop() {
        while (polling && !Thread.currentThread().isInterrupted()) {
            try {
                JsonNode response = call("getUpdates", Map.of(
                        "offset", lastUpdateId + 1,
                        "timeout", 50,
                        "allowed_updates", List.of("message", "pre_checkout_query")
                ));
                for (JsonNode update : response.path("result")) {
                    lastUpdateId = Math.max(lastUpdateId, update.path("update_id").asLong());
                    try {
                        handleUpdate(update);
                    } catch (Exception ex) {
                        log.warn("Unable to handle Telegram update {}: {}", update.path("update_id").asLong(), ex.getMessage());
                    }
                }
            } catch (Exception ex) {
                if (polling) {
                    log.warn("Telegram long polling failed: {}", ex.getMessage());
                    sleepAfterPollingError();
                }
            }
        }
    }

    private void sleepAfterPollingError() {
        try {
            Thread.sleep(3000);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    @jakarta.annotation.PreDestroy
    public void stopLongPolling() {
        polling = false;
        if (pollingThread != null) {
            pollingThread.interrupt();
        }
    }

    private JsonNode call(String method, Map<String, Object> body) {
        if (!properties.telegram().configured()) {
            throw new IllegalStateException("Telegram bot token is not configured");
        }
        JsonNode response = restClient.post()
                .uri("https://api.telegram.org/bot" + properties.telegram().botToken() + "/" + method)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(JsonNode.class);
        if (response == null || !response.path("ok").asBoolean(false)) {
            throw new IllegalStateException("Telegram API error: " + response);
        }
        return response;
    }
}
