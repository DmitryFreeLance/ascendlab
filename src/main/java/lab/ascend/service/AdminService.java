package lab.ascend.service;

import lab.ascend.config.AppProperties;
import lab.ascend.repo.AdminRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Service
public class AdminService implements ApplicationRunner {
    private final AppProperties properties;
    private final AdminRepository admins;
    private final PlanCatalogService plans;
    private final SubscriptionService subscriptions;

    public AdminService(AppProperties properties,
                        AdminRepository admins,
                        PlanCatalogService plans,
                        SubscriptionService subscriptions) {
        this.properties = properties;
        this.admins = admins;
        this.plans = plans;
        this.subscriptions = subscriptions;
    }

    @Override
    public void run(ApplicationArguments args) {
        for (Long telegramId : configuredAdminIds()) {
            admins.add(telegramId, "env");
        }
    }

    public boolean isAdmin(long telegramId) {
        return admins.exists(telegramId);
    }

    public void requireAdmin(long telegramId) {
        if (!isAdmin(telegramId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin access required");
        }
    }

    public void addAdmin(long actorTelegramId, long newAdminTelegramId, String note) {
        requireAdmin(actorTelegramId);
        admins.add(newAdminTelegramId, note == null ? "manual" : note.trim());
    }

    public Map<String, Object> overview(long actorTelegramId) {
        requireAdmin(actorTelegramId);
        return Map.of(
                "stats", admins.stats(),
                "system", systemStatus(),
                "plans", plans.all(),
                "admins", admins.admins(),
                "providerStats", admins.providerStats(),
                "planStats", admins.planStats(),
                "paymentStatusStats", admins.paymentStatusStats(),
                "recentAnalyses", admins.recentAnalyses(),
                "recentPayments", admins.recentPayments(),
                "recentUsers", admins.recentUsers()
        );
    }

    public Map<String, Object> grantSubscription(long actorTelegramId, long targetTelegramId, String planCode) {
        requireAdmin(actorTelegramId);
        var plan = plans.get(planCode);
        subscriptions.activate(targetTelegramId, plan, "admin", "admin:" + actorTelegramId);
        return Map.of(
                "ok", true,
                "telegramId", targetTelegramId,
                "plan", plan,
                "subscription", subscriptions.status(targetTelegramId)
        );
    }

    private Map<String, Object> systemStatus() {
        return Map.of(
                "publicUrl", properties.miniAppUrl(),
                "demoMode", properties.demoMode(),
                "longPolling", properties.telegram().longPolling(),
                "botConfigured", properties.telegram().configured(),
                "aiConfigured", properties.ai().configured(),
                "cryptoConfigured", properties.payments().cryptoConfigured(),
                "cardConfigured", properties.payments().cardConfigured()
        );
    }

    private List<Long> configuredAdminIds() {
        String value = properties.adminTelegramIds();
        if (value == null || value.isBlank()) {
            return properties.demoMode() ? List.of(726773708L) : List.of();
        }
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .map(Long::parseLong)
                .toList();
    }
}
