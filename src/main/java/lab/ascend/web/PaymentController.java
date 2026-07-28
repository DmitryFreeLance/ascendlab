package lab.ascend.web;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import lab.ascend.config.AppProperties;
import lab.ascend.domain.UserProfile;
import lab.ascend.service.CryptoPayClient;
import lab.ascend.service.CurrentUserService;
import lab.ascend.service.PaymentService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/payments")
public class PaymentController {
    private final CurrentUserService currentUser;
    private final PaymentService payments;
    private final CryptoPayClient cryptoPay;
    private final AppProperties properties;

    public PaymentController(CurrentUserService currentUser,
                             PaymentService payments,
                             CryptoPayClient cryptoPay,
                             AppProperties properties) {
        this.currentUser = currentUser;
        this.payments = payments;
        this.cryptoPay = cryptoPay;
        this.properties = properties;
    }

    @PostMapping("/stars")
    public PaymentService.PaymentLink stars(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                            @RequestBody PlanRequest request) {
        UserProfile user = currentUser.require(initData);
        return payments.createStars(user.telegramId(), request.planCode());
    }

    @PostMapping("/crypto")
    public PaymentService.PaymentLink crypto(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                             @RequestBody PlanRequest request) {
        UserProfile user = currentUser.require(initData);
        return payments.createCrypto(user.telegramId(), request.planCode());
    }

    @PostMapping("/card")
    public PaymentService.PaymentLink card(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                           @RequestBody PlanRequest request) {
        UserProfile user = currentUser.require(initData);
        return payments.createCard(user.telegramId(), request.planCode());
    }

    @PostMapping("/demo/activate")
    public Map<String, Object> demoActivate(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                            @RequestBody PlanRequest request) {
        UserProfile user = currentUser.require(initData);
        payments.activateDemo(user.telegramId(), request.planCode());
        return Map.of("ok", true);
    }

    @GetMapping("/{paymentId}/status")
    public PaymentService.PaymentState status(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                              @PathVariable String paymentId) {
        UserProfile user = currentUser.require(initData);
        return payments.status(user.telegramId(), paymentId);
    }

    @PostMapping("/crypto/webhook/{secret}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cryptoWebhook(@PathVariable String secret,
                              @RequestHeader(value = "crypto-pay-api-signature", required = false) String signature,
                              @RequestBody String rawBody) {
        if (!properties.payments().cryptoPayWebhookSecret().equals(secret)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        if (!cryptoPay.verifySignature(rawBody, signature)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        JsonNode update = cryptoPay.parse(rawBody);
        payments.handleCryptoWebhook(update);
    }

    @PostMapping("/yookassa/webhook/{secret}")
    @ResponseStatus(HttpStatus.OK)
    public void yookassaWebhook(@PathVariable String secret, @RequestBody String rawBody) {
        if (!properties.payments().yookassaWebhookSecret().equals(secret)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        payments.handleYooKassaWebhook(rawBody);
    }

    public record PlanRequest(@NotBlank String planCode) {
    }
}
