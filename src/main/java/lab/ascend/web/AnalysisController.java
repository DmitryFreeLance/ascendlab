package lab.ascend.web;

import lab.ascend.domain.UserProfile;
import lab.ascend.service.AnalysisService;
import lab.ascend.service.CurrentUserService;
import lab.ascend.service.SubscriptionService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/analysis")
public class AnalysisController {
    private final CurrentUserService currentUser;
    private final SubscriptionService subscriptions;
    private final AnalysisService analysis;

    public AnalysisController(CurrentUserService currentUser,
                              SubscriptionService subscriptions,
                              AnalysisService analysis) {
        this.currentUser = currentUser;
        this.subscriptions = subscriptions;
        this.analysis = analysis;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> analyze(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                       @RequestPart(value = "front", required = false) MultipartFile front,
                                       @RequestPart(value = "side", required = false) MultipartFile side) throws IOException {
        UserProfile user = currentUser.require(initData);
        boolean pro = subscriptions.isActive(user.telegramId());
        List<AnalysisService.UploadedImage> images = AnalysisService.UploadedImage.list(toImage(front), toImage(side));
        return analysis.analyze(user, images, pro);
    }

    private AnalysisService.UploadedImage toImage(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            return null;
        }
        return new AnalysisService.UploadedImage(file.getContentType() == null ? "image/jpeg" : file.getContentType(), file.getBytes());
    }
}
