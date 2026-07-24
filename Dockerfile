FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
ENV PORT=8080
ENV APP_DATA_DIR=/data
RUN addgroup --system ascend \
    && adduser --system --ingroup ascend ascend \
    && mkdir -p /data \
    && chown -R ascend:ascend /data
COPY --from=build /workspace/target/ascendlab-*.jar /app/ascendlab.jar
USER ascend
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/ascendlab.jar"]
