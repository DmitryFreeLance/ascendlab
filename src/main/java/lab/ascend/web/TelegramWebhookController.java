package lab.ascend.web;

import com.fasterxml.jackson.databind.JsonNode;
import lab.ascend.config.AppProperties;
import lab.ascend.service.TelegramBotService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/telegram")
public class TelegramWebhookController {
    private final AppProperties properties;
    private final TelegramBotService bot;

    public TelegramWebhookController(AppProperties properties, TelegramBotService bot) {
        this.properties = properties;
        this.bot = bot;
    }

    @PostMapping("/webhook/{secret}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void webhook(@PathVariable String secret, @RequestBody JsonNode update) {
        if (!properties.telegram().webhookSecret().equals(secret)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        bot.handleUpdate(update);
    }
}
