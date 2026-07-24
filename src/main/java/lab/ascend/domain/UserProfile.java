package lab.ascend.domain;

public record UserProfile(
        long telegramId,
        String firstName,
        String lastName,
        String username,
        String languageCode,
        String photoUrl,
        String gender,
        int age
) {
    public String displayName() {
        if (firstName != null && !firstName.isBlank()) {
            return firstName;
        }
        if (username != null && !username.isBlank()) {
            return "@" + username;
        }
        return "Ascender";
    }
}
