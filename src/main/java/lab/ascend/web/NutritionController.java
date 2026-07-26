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

    public record MealRequest(@NotBlank String mealType, @NotBlank String text) {
    }
}
