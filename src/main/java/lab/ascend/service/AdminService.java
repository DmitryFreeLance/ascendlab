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

    public AdminService(AppProperties properties, AdminRepository admins, PlanCatalogService plans) {
        this.properties = properties;
        this.admins = admins;
        this.plans = plans;
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
                "plans", plans.all(),
                "admins", admins.admins(),
                "recentPayments", admins.recentPayments(),
                "recentUsers", admins.recentUsers()
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
