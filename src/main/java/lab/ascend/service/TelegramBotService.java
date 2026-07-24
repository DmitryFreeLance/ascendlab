package lab.ascend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lab.ascend.config.AppProperties;
import lab.ascend.domain.PaymentStatus;
import lab.ascend.domain.Plan;
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
    private final RestClient restClient;

    public TelegramBotService(AppProperties properties,
                              ObjectMapper objectMapper,
                              PaymentRepository payments,
                              SubscriptionService subscriptions) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.payments = payments;
        this.subscriptions = subscriptions;
        this.restClient = RestClient.create();
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!properties.telegram().configured()) {
            log.info("Telegram bot token is not configured; bot API calls are disabled.");
            return;
        }
        setChatMenuButton();
        if (properties.telegram().registerWebhook()) {
            setWebhook();
        }
    }

    public String createStarsInvoiceLink(long telegramId, Plan plan, String paymentId) {
        Map<String, Object> body = Map.of(
                "title", "AscendLab - " + plan.title(),
                "description", "Доступ к AscendPro: анализ лица, AscendGPT, питание, академия и MogBattle.",
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
        Plan plan = Plan.byCode(parts[2]);
        payments.markStatus(paymentId, PaymentStatus.PAID, payment.path("telegram_payment_charge_id").asText(null), payment.toString());
        subscriptions.activate(telegramId, plan, "telegram_stars", paymentId);
        sendMessage(message.path("chat").path("id").asLong(),
                "Оплата прошла. AscendPro активирован, мини-апп уже обновит доступ автоматически.");
    }

    private void sendStart(long chatId) {
        Map<String, Object> replyMarkup = Map.of("inline_keyboard", List.of(
                List.of(Map.of(
                        "text", "Открыть AscendLab",
                        "web_app", Map.of("url", properties.miniAppUrl())
                )),
                List.of(Map.of(
                        "text", "Тех. поддержка",
                        "url", "https://t.me/" + properties.telegram().botUsername()
                ))
        ));
        Map<String, Object> body = Map.of(
                "chat_id", chatId,
                "text", "AscendLab готов. Нажми кнопку ниже, чтобы открыть мини-приложение.",
                "reply_markup", replyMarkup
        );
        call("sendMessage", body);
    }

    private void sendPaySupport(long chatId) {
        sendMessage(chatId, "Поддержка оплат: напишите сюда номер платежа и способ оплаты. Возвраты Stars делаются через Bot API refundStarPayment после проверки обращения.");
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
                            "text", "AscendLab",
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
