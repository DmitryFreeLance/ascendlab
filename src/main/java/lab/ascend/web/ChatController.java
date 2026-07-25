package lab.ascend.web;

import jakarta.validation.constraints.NotBlank;
import lab.ascend.domain.UserProfile;
import lab.ascend.service.AiService;
import lab.ascend.service.CurrentUserService;
import lab.ascend.service.SubscriptionService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.util.List;

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    private final CurrentUserService currentUser;
    private final SubscriptionService subscriptions;
    private final AiService ai;

    public ChatController(CurrentUserService currentUser, SubscriptionService subscriptions, AiService ai) {
        this.currentUser = currentUser;
        this.subscriptions = subscriptions;
        this.ai = ai;
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> stream(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                                        @RequestBody ChatRequest request) {
        UserProfile user = currentUser.require(initData);
        boolean active = subscriptions.isActive(user.telegramId());
        StreamingResponseBody body = output -> ai.streamChat(user, active, request.message(), request.history(), output);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noCache())
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(body);
    }

    public record ChatRequest(@NotBlank String message, List<AiService.ChatMessage> history) {
    }
}
