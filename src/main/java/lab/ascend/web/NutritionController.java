package lab.ascend.web;

import jakarta.validation.constraints.NotBlank;
import lab.ascend.domain.UserProfile;
import lab.ascend.service.CurrentUserService;
import lab.ascend.service.NutritionService;
import lab.ascend.service.SubscriptionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.MediaType;

import java.io.IOException;

import java.util.Map;

@RestController
@RequestMapping("/api/nutrition")
public class NutritionController {
    private final CurrentUserService currentUser;
    private final SubscriptionService subscriptions;
    private final NutritionService nutrition;

    public NutritionController(CurrentUserService currentUser,
                               SubscriptionService subscriptions,
                               NutritionService nutrition) {
        this.currentUser = currentUser;
        this.subscriptions = subscriptions;
        this.nutrition = nutrition;
    }

    @GetMapping
    public Map<String, Object> today(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData) {
        UserProfile user = currentUser.require(initData);
        return nutrition.summary(user.telegramId());
    }

    @GetMapping("/history")
    public Map<String, Object> history(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData) {
        UserProfile user = currentUser.require(initData);
        return nutrition.history(user.telegramId());
    }

    @PostMapping
    public Map<String, Object> add(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                   @RequestBody MealRequest request) {
        UserProfile user = currentUser.require(initData);
        boolean pro = subscriptions.isActive(user.telegramId());
        if (!pro) {
            throw new IllegalStateException("AI-оценка КБЖУ доступна с BodyPro");
        }
        return nutrition.add(user.telegramId(), request.mealType(), request.text(), pro);
    }

    @PostMapping(value = "/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> addPhoto(
            @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
            @RequestPart("photo") MultipartFile photo,
            @RequestPart("mealType") String mealType,
            @RequestPart(value = "text", required = false) String text) throws IOException {
        UserProfile user = currentUser.require(initData);
        if (!subscriptions.isActive(user.telegramId())) {
            throw new IllegalStateException("AI-оценка КБЖУ по фото доступна с BodyPro");
        }
        return nutrition.addPhoto(
                user.telegramId(),
                mealType,
                text == null ? "" : text,
                photo.getContentType() == null ? "image/jpeg" : photo.getContentType(),
                photo.getBytes()
        );
    }

    public record MealRequest(@NotBlank String mealType, @NotBlank String text) {
    }
}
