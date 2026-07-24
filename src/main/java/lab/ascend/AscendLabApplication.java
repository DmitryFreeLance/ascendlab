package lab.ascend;

import lab.ascend.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class AscendLabApplication {
    public static void main(String[] args) {
        SpringApplication.run(AscendLabApplication.class, args);
    }
}
