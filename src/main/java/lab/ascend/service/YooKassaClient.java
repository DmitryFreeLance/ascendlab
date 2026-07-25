package lab.ascend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lab.ascend.config.AppProperties;
import lab.ascend.domain.PlanOffer;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class YooKassaClient {
    private final AppProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public YooKassaClient(AppProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.restClient = RestClient.create();
    }

    public YooKassaPayment createPayment(long telegramId, PlanOffer plan, String paymentId) {
        if (!properties.payments().yookassaConfigured()) {
            throw new IllegalStateException("YooKassa credentials are not configured");
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("amount", Map.of(
                "value", String.format(java.util.Locale.US, "%.2f", (double) plan.rub()),
                "currency", "RUB"
        ));
        body.put("capture", true);
        body.put("payment_method_data", Map.of("type", "bank_card"));
        body.put("confirmation", Map.of(
                "type", "redirect",
                "return_url", properties.miniAppUrl() + "?payment=" + paymentId
        ));
        body.put("description", trimDescription("BodyLab - " + plan.title()));
        body.put("metadata", Map.of(
                "paymentId", paymentId,
                "telegramId", String.valueOf(telegramId),
                "planCode", plan.code()
        ));

        JsonNode response = restClient.post()
                .uri(apiUrl() + "/payments")
                .headers(headers -> headers.setBasicAuth(properties.payments().yookassaShopId(), properties.payments().yookassaSecretKey()))
                .header("Idempotence-Key", paymentId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(JsonNode.class);

        if (response == null || response.path("id").asText("").isBlank()) {
            throw new IllegalStateException("YooKassa API returned an invalid response: " + response);
        }
        return toPayment(response);
    }

    public YooKassaPayment getPayment(String yookassaPaymentId) {
        if (!properties.payments().yookassaConfigured()) {
            throw new IllegalStateException("YooKassa credentials are not configured");
        }
        JsonNode response = restClient.get()
                .uri(apiUrl() + "/payments/{paymentId}", yookassaPaymentId)
                .headers(headers -> headers.setBasicAuth(properties.payments().yookassaShopId(), properties.payments().yookassaSecretKey()))
                .retrieve()
                .body(JsonNode.class);
        if (response == null || response.path("id").asText("").isBlank()) {
            throw new IllegalStateException("YooKassa API returned an invalid payment response: " + response);
        }
        return toPayment(response);
    }

    public JsonNode parseWebhook(String rawBody) {
        try {
            return objectMapper.readTree(rawBody);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid YooKassa webhook JSON", ex);
        }
    }

    private YooKassaPayment toPayment(JsonNode node) {
        JsonNode metadata = node.path("metadata");
        String confirmationUrl = node.path("confirmation").path("confirmation_url").asText("");
        return new YooKassaPayment(
                node.path("id").asText(),
                node.path("status").asText(),
                confirmationUrl,
                metadata.path("paymentId").asText(""),
                metadata.path("telegramId").asText(""),
                metadata.path("planCode").asText(""),
                node.toString()
        );
    }

    private String apiUrl() {
        String url = properties.payments().yookassaApiUrl();
        if (url == null || url.isBlank()) {
            return "https://api.yookassa.ru/v3";
        }
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private String trimDescription(String value) {
        return value.length() <= 128 ? value : value.substring(0, 128);
    }

    public record YooKassaPayment(
            String id,
            String status,
            String confirmationUrl,
            String paymentId,
            String telegramId,
            String planCode,
            String raw
    ) {
    }
}
