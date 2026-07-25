package lab.ascend.service;

import com.fasterxml.jackson.databind.JsonNode;
import lab.ascend.config.AppProperties;
import lab.ascend.domain.PaymentStatus;
import lab.ascend.domain.PlanOffer;
import lab.ascend.repo.PaymentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@Service
public class PaymentService {
    private final AppProperties properties;
    private final PaymentRepository payments;
    private final TelegramBotService telegramBot;
    private final CryptoPayClient cryptoPay;
    private final YooKassaClient yooKassa;
    private final SubscriptionService subscriptions;
    private final PlanCatalogService plans;

    public PaymentService(AppProperties properties,
                          PaymentRepository payments,
                          TelegramBotService telegramBot,
                          CryptoPayClient cryptoPay,
                          YooKassaClient yooKassa,
                          SubscriptionService subscriptions,
                          PlanCatalogService plans) {
        this.properties = properties;
        this.payments = payments;
        this.telegramBot = telegramBot;
        this.cryptoPay = cryptoPay;
        this.yooKassa = yooKassa;
        this.subscriptions = subscriptions;
        this.plans = plans;
    }

    public PaymentLink createStars(long telegramId, String planCode) {
        PlanOffer plan = plans.get(planCode);
        if (!properties.telegram().configured()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Telegram bot token is required for Stars invoices");
        }
        String paymentId = payments.create(telegramId, plan.code(), "telegram_stars", String.valueOf(plan.stars()), "XTR", null);
        String url = telegramBot.createStarsInvoiceLink(telegramId, plan, paymentId);
        payments.linkExternal(paymentId, null, url, null);
        return new PaymentLink(paymentId, "telegram_stars", url, "open_invoice");
    }

    public PaymentLink createCrypto(long telegramId, String planCode) {
        PlanOffer plan = plans.get(planCode);
        if (!properties.payments().cryptoConfigured()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Crypto Pay token is not configured");
        }
        String paymentId = payments.create(telegramId, plan.code(), "crypto_pay", plan.usd().toPlainString(), "USDT", null);
        CryptoPayClient.CryptoInvoice invoice = cryptoPay.createInvoice(telegramId, plan, paymentId);
        payments.linkExternal(paymentId, invoice.invoiceId(), invoice.url(), invoice.payload());
        return new PaymentLink(paymentId, "crypto_pay", invoice.url(), "open_telegram_link");
    }

    public PaymentLink createCard(long telegramId, String planCode) {
        PlanOffer plan = plans.get(planCode);
        if (!properties.payments().yookassaConfigured()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "YooKassa credentials are not configured");
        }
        String paymentId = payments.create(telegramId, plan.code(), "card", String.valueOf(plan.rub()), "RUB", null);
        YooKassaClient.YooKassaPayment yooPayment = yooKassa.createPayment(telegramId, plan, paymentId);
        if (yooPayment.confirmationUrl().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "YooKassa did not return a confirmation URL");
        }
        payments.linkExternal(paymentId, yooPayment.id(), yooPayment.confirmationUrl(), yooPayment.raw());
        return new PaymentLink(paymentId, "yookassa", yooPayment.confirmationUrl(), "open_external");
    }

    public void handleCryptoWebhook(JsonNode update) {
        if (!"invoice_paid".equals(update.path("update_type").asText())) {
            return;
        }
        JsonNode invoice = update.path("payload");
        String payload = invoice.path("payload").asText("");
        String[] parts = payload.split(":");
        if (parts.length < 3) {
            return;
        }
        String paymentId = parts[0];
        long telegramId = Long.parseLong(parts[1]);
        PlanOffer plan = plans.get(parts[2]);
        if (alreadyPaid(paymentId)) {
            return;
        }
        payments.markStatus(paymentId, PaymentStatus.PAID, invoice.path("invoice_id").asText(null), invoice.toString());
        subscriptions.activate(telegramId, plan, "crypto_pay", paymentId);
    }

    public void handleYooKassaWebhook(String rawBody) {
        JsonNode update = yooKassa.parseWebhook(rawBody);
        String event = update.path("event").asText("");
        if (!"payment.succeeded".equals(event) && !"payment.canceled".equals(event)) {
            return;
        }
        String yookassaPaymentId = update.path("object").path("id").asText("");
        if (yookassaPaymentId.isBlank()) {
            return;
        }

        YooKassaClient.YooKassaPayment verified = yooKassa.getPayment(yookassaPaymentId);
        String paymentId = verified.paymentId();
        if (paymentId.isBlank()) {
            return;
        }

        if ("payment.canceled".equals(event) || "canceled".equals(verified.status())) {
            payments.markStatus(paymentId, PaymentStatus.CANCELLED, verified.id(), verified.raw());
            return;
        }
        if (!"succeeded".equals(verified.status()) || alreadyPaid(paymentId)) {
            return;
        }

        PaymentRepository.PaymentRecord local = payments.findRequired(paymentId);
        PlanOffer plan = plans.get(local.planCode());
        payments.markStatus(paymentId, PaymentStatus.PAID, verified.id(), verified.raw());
        subscriptions.activate(local.telegramId(), plan, "yookassa", paymentId);
    }

    public void activateDemo(long telegramId, String planCode) {
        if (!properties.demoMode()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        PlanOffer plan = plans.get(planCode);
        subscriptions.activate(telegramId, plan, "demo", "demo");
    }

    public PaymentState status(long telegramId, String paymentId) {
        PaymentRepository.PaymentRecord local = payments.findRequired(paymentId);
        if (local.telegramId() != telegramId) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return new PaymentState(paymentId, local.provider(), local.status(), subscriptions.isActive(telegramId));
    }

    public Map<String, Object> paymentConfig() {
        return Map.of(
                "telegramStars", properties.telegram().configured(),
                "cryptoPay", properties.payments().cryptoConfigured(),
                "card", properties.payments().cardConfigured(),
                "cardProvider", "yookassa",
                "demoMode", properties.demoMode()
        );
    }

    private boolean alreadyPaid(String paymentId) {
        return PaymentStatus.PAID.name().equals(payments.findRequired(paymentId).status());
    }

    public record PaymentLink(String paymentId, String provider, String url, String action) {
    }

    public record PaymentState(String paymentId, String provider, String status, boolean subscriptionActive) {
    }
}
