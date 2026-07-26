package lab.ascend.web;

import lab.ascend.domain.UserProfile;
import lab.ascend.service.AnalysisService;
import lab.ascend.service.CurrentUserService;
import lab.ascend.service.SubscriptionService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PathVariable;
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
    private static final Map<String, AnalysisService.ToolProfile> TOOLS = Map.of(
            "skin", new AnalysisService.ToolProfile("skin", "Уход за кожей", "тон, текстура, барьер и зоны ухода",
                    List.of("Барьер", "Тон", "Текстура"), List.of("Утро: очищение, увлажнение, SPF.", "Вечер: очищение и восстановление.", "Новый актив вводить постепенно.")),
            "hair", new AnalysisService.ToolProfile("hair", "Контур и волосы", "контур стрижки, объём и форма волос",
                    List.of("Контур", "Объём", "Форма"), List.of("Проверить виски и затылок.", "Сделать фото спереди и сбоку.", "Подготовить 2 референса.")),
            "sleep", new AnalysisService.ToolProfile("sleep", "Сон и восстановление", "утренняя свежесть, отёки и визуальная усталость",
                    List.of("Режим", "Свежесть", "Отёки"), List.of("Лечь в один коридор времени.", "Убрать яркий экран перед сном.", "Утром отметить отёки и энергию.")),
            "water", new AnalysisService.ToolProfile("water", "Гидратация", "свежесть лица, отёки и стабильность кожи",
                    List.of("Свежесть", "Соль", "Отёки"), List.of("Разнести воду по дню.", "Отметить солёную еду вечером.", "Сравнить утреннее лицо.")),
            "style", new AnalysisService.ToolProfile("style", "Style Guide", "посадка, цвета и силуэт образа",
                    List.of("Посадка", "Цвета", "Силуэт"), List.of("Выбрать один чистый базовый образ.", "Убрать лишний акцент.", "Сфотографировать образ при дневном свете.")),
            "photo", new AnalysisService.ToolProfile("photo", "Фото-профиль", "свет, ракурс и выражение лица на фото",
                    List.of("Свет", "Ракурс", "Выражение"), List.of("Камера на уровне глаз.", "Свет из окна под углом.", "Сделать серию и выбрать 2 кадра.")),
            "wardrobe", new AnalysisService.ToolProfile("wardrobe", "Гардероб", "гардероб, посадка, сочетания и цветовые акценты",
                    List.of("База", "Комбинации", "Акценты"), List.of("Собрать 3 связки верх-низ-обувь.", "Отложить вещи с плохой посадкой.", "Добавить один цветовой акцент.")),
            "looks", new AnalysisService.ToolProfile("looks", "Похож на", "архетип подачи, фото, волосы, свет и стиль",
                    List.of("Архетип", "Подача", "Фото"), List.of("Выбрать 2 референса.", "Повторить один элемент подачи.", "Сохранить идеи в план дня."))
    );

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

    @PostMapping(value = "/tools/{toolId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> analyzeTool(@RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
                                           @PathVariable String toolId,
                                           @RequestPart("photo") MultipartFile photo) throws IOException {
        UserProfile user = currentUser.require(initData);
        AnalysisService.ToolProfile tool = TOOLS.get(toolId);
        if (tool == null) {
            throw new IllegalArgumentException("Неизвестный раздел");
        }
        boolean pro = subscriptions.isActive(user.telegramId());
        return analysis.analyzeTool(user, tool, toImage(photo), pro);
    }

    private AnalysisService.UploadedImage toImage(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            return null;
        }
        return new AnalysisService.UploadedImage(file.getContentType() == null ? "image/jpeg" : file.getContentType(), file.getBytes());
    }
}
