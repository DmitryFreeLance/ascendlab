package lab.ascend.web;

import lab.ascend.config.AppProperties;
import lab.ascend.domain.UserProfile;
import lab.ascend.repo.AnalysisRepository;
import lab.ascend.repo.UserRepository;
import lab.ascend.service.AdminService;
import lab.ascend.service.ChatUsageService;
import lab.ascend.service.CurrentUserService;
import lab.ascend.service.PaymentService;
import lab.ascend.service.PlanCatalogService;
import lab.ascend.service.SubscriptionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AppController {
    private final CurrentUserService currentUser;
    private final SubscriptionService subscriptions;
    private final PaymentService payments;
    private final PlanCatalogService plans;
    private final AdminService admins;
    private final ChatUsageService chatUsage;
    private final UserRepository users;
    private final AnalysisRepository analyses;
    private final AppProperties properties;

    public AppController(CurrentUserService currentUser,
                         SubscriptionService subscriptions,
                         PaymentService payments,
                         PlanCatalogService plans,
                         AdminService admins,
                         ChatUsageService chatUsage,
                         UserRepository users,
                         AnalysisRepository analyses,
                         AppProperties properties) {
        this.currentUser = currentUser;
        this.subscriptions = subscriptions;
        this.payments = payments;
        this.plans = plans;
        this.admins = admins;
        this.chatUsage = chatUsage;
        this.users = users;
        this.analyses = analyses;
        this.properties = properties;
    }

    @GetMapping("/bootstrap")
    public Map<String, Object> bootstrap(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData) {
        UserProfile user = currentUser.require(initData);
        return Map.ofEntries(
                Map.entry("user", user),
                Map.entry("onboardingSeen", users.onboardingSeen(user.telegramId())),
                Map.entry("isAdmin", admins.isAdmin(user.telegramId())),
                Map.entry("subscription", subscriptions.status(user.telegramId())),
                Map.entry("chatUsage", chatUsage.status(user.telegramId())),
                Map.entry("hasFaceAnalysis", analyses.existsByTelegramId(user.telegramId())),
                Map.entry("communityProgress", analyses.communityProgress()),
                Map.entry("plans", plans.all()),
                Map.entry("payments", payments.paymentConfig()),
                Map.entry("features", features()),
                Map.entry("botUsername", properties.telegram().botUsername())
        );
    }

    @GetMapping("/community-progress")
    public Map<String, Object> communityProgress(
            @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData) {
        currentUser.require(initData);
        return analyses.communityProgress();
    }

    @PatchMapping("/settings")
    public Map<String, Object> settings(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                        @RequestBody SettingsRequest request) {
        UserProfile user = currentUser.require(initData);
        int age = Math.max(14, Math.min(80, request.age()));
        String gender = "female".equalsIgnoreCase(request.gender()) ? "female" : "male";
        String language = "en".equalsIgnoreCase(request.languageCode()) ? "en" : "ru";
        users.updateSettings(user.telegramId(), gender, age, language);
        return bootstrap(initData);
    }

    @PostMapping("/onboarding/complete")
    public Map<String, Object> completeOnboarding(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData) {
        UserProfile user = currentUser.require(initData);
        users.markOnboardingSeen(user.telegramId());
        return Map.of("ok", true);
    }

    private List<Map<String, String>> features() {
        return List.of(
                feature("face", "Анализ лица", "Оценка черт и зон роста", "scan-face"),
                feature("skin", "Skincare", "Уход за кожей", "droplets"),
                feature("hair", "Стрижка", "Подбор формы", "scissors"),
                feature("sleep", "Sleep Max", "Режим сна", "moon"),
                feature("water", "Вода", "Напоминания", "waves"),
                feature("body", "Body Max", "Тело", "activity"),
                feature("style", "Стиль", "Style Guide", "sparkles"),
                feature("photo", "Фото-профиль", "Свет и ракурсы", "aperture"),
                feature("wardrobe", "Гардероб", "Силуэт и цвета", "shirt"),
                feature("gpt", "BodyGPT", "Личный помощник", "brain"),
                feature("food", "Питание", "Дневник КБЖУ", "utensils"),
                feature("academy", "Академия", "Гайды", "graduation-cap"),
                feature("looks", "Похож на", "Looks Like", "user-search"),
                feature("battle", "MogBattle", "Битва внешности", "swords")
        );
    }

    private Map<String, String> feature(String id, String title, String subtitle, String icon) {
        return Map.of("id", id, "title", title, "subtitle", subtitle, "icon", icon);
    }

    public record SettingsRequest(String gender, int age, String languageCode) {
    }
}
