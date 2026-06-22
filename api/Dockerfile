# syntax=docker/dockerfile:1
# Multi-stage build for the Spring Boot API. Builds the boot jar with the Gradle
# wrapper (JDK 17) and runs it on a slim JRE. Build context = ./api.

# ---- build ----
FROM eclipse-temurin:17-jdk AS build
WORKDIR /workspace

# Copy the build definition first so the (slow) dependency download is cached in its own
# layer and only re-runs when the Gradle config changes.
COPY gradlew settings.gradle build.gradle gradle.properties sonar-project.properties ./
COPY gradle ./gradle
# buildSrc holds JHipster's Gradle convention plugins (jhipster.*-conventions) — the build
# won't configure without it.
COPY buildSrc ./buildSrc
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon > /dev/null 2>&1 || true

# Build the executable jar. Tests are run in CI, not here.
COPY src ./src
RUN ./gradlew bootJar -x test --no-daemon \
 && cp "$(ls -S build/libs/*.jar | head -n1)" app.jar

# ---- runtime ----
FROM eclipse-temurin:17-jre AS runtime
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app
COPY --from=build /workspace/app.jar app.jar
USER app

EXPOSE 8080
# prod profile + api-docs (springdoc). The JWT secret, datasource and S3 settings come
# from the environment (see .env.example) — the image ships no secrets.
ENV JAVA_OPTS="-Xms256m -Xmx512m" \
    SPRING_PROFILES_ACTIVE=prod,api-docs
ENTRYPOINT ["sh","-c","java $JAVA_OPTS -jar /app/app.jar"]
