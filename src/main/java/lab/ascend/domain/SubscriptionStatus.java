package lab.ascend.domain;

import java.time.Instant;

public record SubscriptionStatus(
        boolean active,
        String planCode,
        Instant activeUntil,
        long daysLeft
) {
}
