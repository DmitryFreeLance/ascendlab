package lab.ascend.service;

import lab.ascend.domain.UserProfile;
import lab.ascend.repo.UserRepository;
import org.springframework.stereotype.Service;

@Service
public class CurrentUserService {
    private final TelegramInitDataService initDataService;
    private final UserRepository users;

    public CurrentUserService(TelegramInitDataService initDataService, UserRepository users) {
        this.initDataService = initDataService;
        this.users = users;
    }

    public UserProfile require(String initData) {
        return users.upsert(initDataService.authenticate(initData));
    }
}
