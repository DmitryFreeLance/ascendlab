package lab.ascend.web;

import jakarta.validation.constraints.NotBlank;
import lab.ascend.domain.PlanOffer;
import lab.ascend.domain.UserProfile;
import lab.ascend.service.AdminService;
import lab.ascend.service.CurrentUserService;
import lab.ascend.service.PlanCatalogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final CurrentUserService currentUser;
    private final AdminService admins;
    private final PlanCatalogService plans;

    public AdminController(CurrentUserService currentUser, AdminService admins, PlanCatalogService plans) {
        this.currentUser = currentUser;
        this.admins = admins;
        this.plans = plans;
    }

    @GetMapping
    public Map<String, Object> overview(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData) {
        UserProfile user = currentUser.require(initData);
        return admins.overview(user.telegramId());
    }

    @PostMapping("/admins")
    public Map<String, Object> addAdmin(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                        @RequestBody AddAdminRequest request) {
        UserProfile user = currentUser.require(initData);
        admins.addAdmin(user.telegramId(), request.telegramId(), request.note());
        return admins.overview(user.telegramId());
    }

    @PatchMapping("/plans/{code}")
    public PlanOffer updatePlan(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                @PathVariable String code,
                                @RequestBody UpdatePlanRequest request) {
        UserProfile user = currentUser.require(initData);
        admins.requireAdmin(user.telegramId());
        return plans.update(code, request.rub(), request.stars(), request.usd(), request.badge());
    }

    @PostMapping("/subscriptions/grant")
    public Map<String, Object> grantSubscription(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                                @RequestBody GrantSubscriptionRequest request) {
        UserProfile user = currentUser.require(initData);
        return admins.grantSubscription(user.telegramId(), request.telegramId(), request.planCode());
    }

    public record AddAdminRequest(long telegramId, String note) {
    }

    public record UpdatePlanRequest(int rub, int stars, BigDecimal usd, String badge) {
    }

    public record GrantSubscriptionRequest(long telegramId, @NotBlank String planCode) {
    }
}
