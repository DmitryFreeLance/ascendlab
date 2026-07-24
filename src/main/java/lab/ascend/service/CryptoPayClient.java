package lab.ascend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lab.ascend.config.AppProperties;
import lab.ascend.domain.PlanOffer;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class CryptoPayClient {
    private final AppProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public CryptoPayClient(AppProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.restClient = RestClient.create();
    }

    public CryptoInvoice createInvoice(long telegramId, PlanOffer plan, String paymentId) {
        if (!properties.payments().cryptoConfigured()) {
            throw new IllegalStateException("Crypto Pay token is not configured");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("currency_type", "fiat");
        body.put("fiat", "RUB");
        body.put("accepted_assets", "USDT,TON,BTC,ETH,USDC");
        body.put("amount", String.valueOf(plan.rub()));
        body.put("description", "AscendLab - " + plan.title());
        body.put("payload", paymentId + ":" + telegramId + ":" + plan.code());
        body.put("allow_comments", false);
        body.put("allow_anonymous", false);
        body.put("expires_in", 3600);
        body.put("paid_btn_name", "callback");
        body.put("paid_btn_url", properties.miniAppUrl());
        JsonNode response = restClient.post()
                .uri(trimSlash(properties.payments().cryptoPayBaseUrl()) + "/api/createInvoice")
                .header("Crypto-Pay-API-Token", properties.payments().cryptoPayToken())
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(JsonNode.class);
        if (response == null || !response.path("ok").asBoolean(false)) {
            throw new IllegalStateException("Crypto Pay API error: " + response);
        }
        JsonNode result = response.path("result");
        String url = firstText(result, "mini_app_invoice_url", "web_app_invoice_url", "bot_invoice_url", "pay_url");
        return new CryptoInvoice(result.path("invoice_id").asText(), url, result.toString());
    }

    public boolean verifySignature(String rawBody, String signature) {
        if (!properties.payments().cryptoConfigured()) {
            return false;
        }
        if (signature == null || signature.isBlank()) {
            return false;
        }
        try {
            byte[] secret = MessageDigest.getInstance("SHA-256")
                    .digest(properties.payments().cryptoPayToken().getBytes(StandardCharsets.UTF_8));
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            String calculated = hex(mac.doFinal(rawBody.getBytes(StandardCharsets.UTF_8)));
            return MessageDigest.isEqual(calculated.getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to verify Crypto Pay signature", ex);
        }
    }

    public JsonNode parse(String rawBody) {
        try {
            return objectMapper.readTree(rawBody);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid Crypto Pay webhook JSON", ex);
        }
    }

    private static String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = node.path(field).asText("");
            if (!value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private static String trimSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private static String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            builder.append(String.format("%02x", b));
        }
        return builder.toString();
    }

    public record CryptoInvoice(String invoiceId, String url, String payload) {
    }
}
