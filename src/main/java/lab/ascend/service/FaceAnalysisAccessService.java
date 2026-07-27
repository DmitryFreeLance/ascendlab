package lab.ascend.service;

import lab.ascend.domain.PlanOffer;
import lab.ascend.repo.AnalysisRepository;
import lab.ascend.repo.FaceAnalysisAccessRepository;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class FaceAnalysisAccessService {
    public static final String FIRST_PRODUCT = "face_first";
    public static final String STANDARD_PRODUCT = "face_once";

    private final FaceAnalysisAccessRepository access;
    private final AnalysisRepository reports;
    private final PlanCatalogService plans;

    public FaceAnalysisAccessService(FaceAnalysisAccessRepository access,
                                     AnalysisRepository reports,
                                     PlanCatalogService plans) {
        this.access = access;
        this.reports = reports;
        this.plans = plans;
    }

    public boolean isProduct(String code) {
        return FIRST_PRODUCT.equals(code) || STANDARD_PRODUCT.equals(code);
    }

    public void grant(long telegramId, String productCode, String paymentId) {
        if (!isProduct(productCode)) {
            throw new IllegalArgumentException("Неизвестный продукт анализа лица");
        }
        access.grant(telegramId, productCode, paymentId);
    }

    public boolean hasCredit(long telegramId) {
        return access.status(telegramId).credits() > 0;
    }

    public int credits(long telegramId) {
        return access.status(telegramId).credits();
    }

    public boolean introAvailable(long telegramId) {
        FaceAnalysisAccessRepository.Wallet wallet = access.status(telegramId);
        return !wallet.introUsed() && !reports.existsByTelegramId(telegramId);
    }

    public boolean consume(long telegramId) {
        return access.consume(telegramId);
    }

    public Map<String, Object> status(long telegramId) {
        FaceAnalysisAccessRepository.Wallet wallet = access.status(telegramId);
        boolean introAvailable = introAvailable(telegramId);
        PlanOffer offer = plans.faceAnalysisOffer(introAvailable);
        return Map.of(
                "credits", wallet.credits(),
                "introAvailable", introAvailable,
                "offer", offer
        );
    }
}
