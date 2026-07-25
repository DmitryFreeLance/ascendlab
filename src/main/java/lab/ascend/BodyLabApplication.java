package lab.ascend;

import lab.ascend.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class BodyLabApplication {
    public static void main(String[] args) {
        SpringApplication.run(BodyLabApplication.class, args);
    }
}
