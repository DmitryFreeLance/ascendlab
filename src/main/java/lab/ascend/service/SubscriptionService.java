package lab.ascend.service;

import lab.ascend.domain.Plan;
import lab.ascend.domain.PlanOffer;
import lab.ascend.domain.SubscriptionStatus;
import lab.ascend.repo.SubscriptionRepository;
import org.springframework.stereotype.Service;

@Service
public class SubscriptionService {
    private final SubscriptionRepository subscriptions;

    public SubscriptionService(SubscriptionRepository subscriptions) {
        this.subscriptions = subscriptions;
    }

    public SubscriptionStatus status(long telegramId) {
        return subscriptions.status(telegramId);
    }

    public boolean isActive(long telegramId) {
        return subscriptions.status(telegramId).active();
    }

    public void activate(long telegramId, Plan plan, String source, String paymentId) {
        subscriptions.activate(telegramId, plan.code(), plan.days(), source, paymentId);
    }

    public void activate(long telegramId, PlanOffer plan, String source, String paymentId) {
        subscriptions.activate(telegramId, plan.code(), plan.days(), source, paymentId);
    }
}
