package lab.ascend.web;

import com.fasterxml.jackson.databind.JsonNode;
import lab.ascend.domain.UserProfile;
import lab.ascend.repo.AnalysisRepository;
import lab.ascend.repo.BattleProfileRepository;
import lab.ascend.service.AiService;
import lab.ascend.service.CurrentUserService;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@RestController
@RequestMapping("/api/battle")
public class BattleController {
    private static final Map<String, Opponent> OPPONENTS = Map.of(
            "neo", new Opponent("Артём", "static/assets/battle/fake-neo.jpg", 64),
            "soft", new Opponent("Никита", "static/assets/battle/fake-soft.jpg", 32),
            "raw", new Opponent("Илья", "static/assets/battle/fake-raw.jpg", 55)
    );

    private final CurrentUserService currentUser;
    private final AiService ai;
    private final BattleProfileRepository profiles;
    private final AnalysisRepository analyses;

    public BattleController(CurrentUserService currentUser,
                            AiService ai,
                            BattleProfileRepository profiles,
                            AnalysisRepository analyses) {
        this.currentUser = currentUser;
        this.ai = ai;
        this.profiles = profiles;
        this.analyses = analyses;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> compare(
            @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
            @RequestPart("photo") MultipartFile photo) throws IOException {
        UserProfile user = currentUser.require(initData);
        if (photo == null || photo.isEmpty()) {
            throw new IllegalArgumentException("Добавь фото для честного сравнения.");
        }

        BattleCandidate opponent = drawOpponent(user.telegramId());
        String ownDataUrl = dataUrl(photo.getContentType(), photo.getBytes());
        String opponentDataUrl = dataUrl(opponent.contentType(), opponent.photo());
        JsonNode report = ai.analyzeBattleWithAi(ownDataUrl, opponentDataUrl)
                .orElseThrow(() -> new IllegalStateException("AI-сравнение сейчас недоступно. Попробуй ещё раз немного позже."));
        if (!report.has("ownScore") || !report.has("opponentScore")) {
            throw new IllegalStateException("AI не вернул полный результат сравнения. Попробуй другое фото.");
        }
        if (!report.path("ownPhotoValid").asBoolean(false) || report.path("ownQualityScore").asInt(0) < 35) {
            String reason = report.path("rejectReason").asText("").trim();
            throw new IllegalStateException(reason.isBlank()
                    ? "Для честного баттла нужно крупное открытое лицо без фильтра и сильного ракурса."
                    : reason);
        }

        int ownScore = battleScore(report.path("ownMetrics"), report.path("ownScore").asInt());
        int opponentScore = opponent.score();
        int delta = ownScore - opponentScore;
        String result = Math.abs(delta) <= 2 ? "tie" : delta > 0 ? "win" : "lose";
        int ownQuality = clamp(report.path("ownQualityScore").asInt());
        int opponentQuality = clamp(report.path("opponentQualityScore").asInt());
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("result", result);
        response.put("opponentId", opponent.id());
        response.put("name", opponent.name());
        response.put("tier", opponent.tier());
        response.put("image", opponent.imageUrl());
        response.put("ownScore", ownScore);
        response.put("opponentScore", opponentScore);
        response.put("summary", battleSummary(ownScore, opponentScore, ownQuality, opponentQuality));
        response.put("scoringMode", "face-first");
        response.put("ownStrengths", textList(report.path("ownStrengths")));
        response.put("opponentStrengths", textList(report.path("opponentStrengths")));
        response.put("focus", textList(report.path("focus")));
        if (analyses.existsByTelegramId(user.telegramId())) {
            profiles.upsertFromFaceAnalysis(
                    user,
                    ownScore,
                    photo.getContentType(),
                    photo.getBytes()
            );
            profiles.updateFromBattle(user.telegramId(), ownScore, photo.getContentType(), photo.getBytes());
        }
        return response;
    }

    @GetMapping("/photo/{publicId}")
    public ResponseEntity<byte[]> profilePhoto(@PathVariable String publicId) {
        BattleProfileRepository.StoredPhoto photo = profiles.photoByPublicId(publicId)
                .orElseThrow(() -> new IllegalArgumentException("Фото участника не найдено"));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noCache().cachePrivate())
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .body(photo.bytes());
    }

    private BattleCandidate drawOpponent(long currentTelegramId) throws IOException {
        List<Map.Entry<String, Opponent>> controls = List.copyOf(OPPONENTS.entrySet());
        int communityCount = profiles.countOpponents(currentTelegramId);
        int selectedIndex = ThreadLocalRandom.current().nextInt(controls.size() + communityCount);
        if (selectedIndex < controls.size()) {
            Map.Entry<String, Opponent> selected = controls.get(selectedIndex);
            Opponent opponent = selected.getValue();
            byte[] bytes = new ClassPathResource(opponent.resourcePath()).getContentAsByteArray();
            return new BattleCandidate(
                    selected.getKey(),
                    opponent.name(),
                    "контрольный профиль",
                    opponent.referenceScore(),
                    "image/jpeg",
                    bytes,
                    "assets/battle/" + opponent.resourcePath().substring(opponent.resourcePath().lastIndexOf('/') + 1)
            );
        }
        return profiles.randomOpponent(currentTelegramId)
                .map(profile -> new BattleCandidate(
                        "community-" + Integer.toUnsignedString(Long.hashCode(profile.telegramId()), 36),
                        profile.displayName(),
                        "участник BodyLab",
                        profile.score(),
                        profile.photoContentType(),
                        profile.photo(),
                        apiPhotoUrl(profile.publicId())
                ))
                .orElseGet(() -> {
                    Map.Entry<String, Opponent> selected = controls.getFirst();
                    Opponent opponent = selected.getValue();
                    try {
                        byte[] bytes = new ClassPathResource(opponent.resourcePath()).getContentAsByteArray();
                        return new BattleCandidate(
                                selected.getKey(),
                                opponent.name(),
                                "контрольный профиль",
                                opponent.referenceScore(),
                                "image/jpeg",
                                bytes,
                                "assets/battle/" + opponent.resourcePath().substring(opponent.resourcePath().lastIndexOf('/') + 1)
                        );
                    } catch (IOException exception) {
                        throw new IllegalStateException("Не удалось загрузить профиль соперника", exception);
                    }
                });
    }

    private static String apiPhotoUrl(String publicId) {
        return "/api/battle/photo/" + publicId;
    }

    private static String dataUrl(String contentType, byte[] bytes) {
        String safeContentType = contentType == null || contentType.isBlank() ? "image/jpeg" : contentType;
        return "data:" + safeContentType + ";base64," + Base64.getEncoder().encodeToString(bytes);
    }

    private static List<String> textList(JsonNode node) {
        if (!node.isArray()) return List.of();
        return java.util.stream.StreamSupport.stream(node.spliterator(), false)
                .map(JsonNode::asText)
                .filter(value -> !value.isBlank())
                .limit(4)
                .toList();
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(100, value));
    }

    static String labeledSummary(String value) {
        return value
                .replaceAll("(?iu)на первом фото", "на твоём фото")
                .replaceAll("(?iu)на втором фото", "на фото соперника")
                .replaceAll("(?iu)первое фото", "Твоё фото")
                .replaceAll("(?iu)второе фото", "Фото соперника")
                .replaceAll("(?iu)первый кадр", "Твоё фото")
                .replaceAll("(?iu)второй кадр", "Фото соперника");
    }

    static int battleScore(JsonNode metrics, int modelScore) {
        double weightedTotal = 0;
        double totalWeight = 0;
        if (metrics.isArray()) {
            for (JsonNode metric : metrics) {
                if (!metric.has("value")) continue;
                String name = metric.path("name").asText("").toLowerCase(java.util.Locale.ROOT);
                double weight = metricWeight(name);
                if (weight <= 0) continue;
                weightedTotal += clamp(metric.path("value").asInt()) * weight;
                totalWeight += weight;
            }
        }
        double raw = totalWeight >= 0.42 ? weightedTotal / totalWeight : clamp(modelScore);
        double calibrated = 50 + (raw - 50) * 0.88;
        return Math.max(25, Math.min(91, (int) Math.round(calibrated)));
    }

    private static double metricWeight(String name) {
        if (name.contains("качество") || name.contains("свет") || name.contains("ракурс")
                || name.contains("кадр") || name.contains("фото")) return 0;
        if (name.contains("гармони")) return 0.24;
        if (name.contains("глаз")) return 0.16;
        if (name.contains("челюст") || name.contains("контур")) return 0.18;
        if (name.contains("кож")) return 0.10;
        if (name.contains("ухож")) return 0.12;
        if (name.contains("причес") || name.contains("подач") || name.contains("волос")) return 0.10;
        if (name.contains("свеж")) return 0.10;
        return 0;
    }

    static String battleSummary(int ownScore, int opponentScore, int ownQuality, int opponentQuality) {
        int delta = ownScore - opponentScore;
        String result = Math.abs(delta) <= 2
                ? "По видимым чертам лица результат почти равный."
                : delta > 0
                    ? "Твоё фото сильнее по совокупности гармонии лица, зоны глаз и контура."
                    : "Фото соперника сильнее по совокупности видимых черт лица.";
        if (Math.abs(ownQuality - opponentQuality) < 12) return result;
        String quality = ownQuality > opponentQuality
                ? " Техническое качество твоего фото выше, но оно не добавлялось к оценке внешности."
                : " Техническое качество фото соперника выше, но оно не добавлялось к оценке внешности.";
        return result + quality;
    }

    static int referenceScore(String opponentId) {
        Opponent opponent = OPPONENTS.get(opponentId);
        return opponent == null ? 0 : opponent.referenceScore();
    }

    private record Opponent(String name, String resourcePath, int referenceScore) {
    }

    private record BattleCandidate(
            String id,
            String name,
            String tier,
            int score,
            String contentType,
            byte[] photo,
            String imageUrl
    ) {
    }
}
