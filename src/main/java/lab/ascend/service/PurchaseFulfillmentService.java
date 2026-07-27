package lab.ascend.service;

import lab.ascend.domain.PlanOffer;
import org.springframework.stereotype.Service;

@Service
public class PurchaseFulfillmentService {
    private final SubscriptionService subscriptions;
    private final FaceAnalysisAccessService faceAccess;

    public PurchaseFulfillmentService(SubscriptionService subscriptions,
                                      FaceAnalysisAccessService faceAccess) {
        this.subscriptions = subscriptions;
        this.faceAccess = faceAccess;
    }

    public void fulfill(long telegramId, PlanOffer offer, String source, String paymentId) {
        if (faceAccess.isProduct(offer.code())) {
            faceAccess.grant(telegramId, offer.code(), paymentId);
            return;
        }
        subscriptions.activate(telegramId, offer, source, paymentId);
    }
}
