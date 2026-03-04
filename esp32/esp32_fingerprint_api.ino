#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_Fingerprint.h>

// --- SETTINGS ---
#define WIFI_SSID "REPLACE_WIFI_SSID"
#define WIFI_PASSWORD "REPLACE_WIFI_PASSWORD"

// Your deployed Netlify API base URL (no trailing slash)
#define API_BASE_URL "https://REPLACE_SITE.netlify.app/api"

// Must match ESP32_DEVICE_KEY in Netlify env (optional server-side, recommended)
#define DEVICE_KEY "REPLACE_DEVICE_KEY"

#define BUZZER_PIN 25
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
HardwareSerial mySerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);
WiFiClientSecure secureClient;

enum ScanResult {
  SCAN_MATCHED,
  SCAN_UNKNOWN,
  SCAN_API_ERROR
};

void beepSuccess() {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(350);
  digitalWrite(BUZZER_PIN, LOW);
}

void beepDenied() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(90);
    digitalWrite(BUZZER_PIN, LOW);
    delay(90);
  }
}

void updateDisplay(const String &line1, const String &line2 = "") {
  display.clearDisplay();
  display.setCursor(0, 10);
  display.setTextSize(2);
  display.println(line1);
  display.setTextSize(1);
  display.println(line2);
  display.display();
}

ScanResult notifyScanToApi(uint16_t fingerprintId) {
  HTTPClient https;
  const String url = String(API_BASE_URL) + "/students/scan";

  if (!https.begin(secureClient, url)) {
    Serial.println("Failed to begin HTTPS request");
    return SCAN_API_ERROR;
  }

  https.addHeader("Content-Type", "application/json");
  https.addHeader("x-device-key", DEVICE_KEY);

  const String body = String("{\"fingerprintId\":") + String(fingerprintId) + "}";
  const int httpCode = https.POST(body);
  const String payload = https.getString();
  https.end();

  Serial.print("POST ");
  Serial.print(url);
  Serial.print(" => ");
  Serial.println(httpCode);
  Serial.println(payload);

  if (httpCode == 200) return SCAN_MATCHED;
  if (httpCode == 404) return SCAN_UNKNOWN;
  return SCAN_API_ERROR;
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED failed");
    for (;;) {}
  }

  display.setTextColor(SSD1306_WHITE);
  updateDisplay("Starting...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  updateDisplay("WiFi...", "Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }

  secureClient.setInsecure(); // For simplicity. Prefer certificate pinning for production.

  mySerial.begin(57600, SERIAL_8N1, 16, 17);
  finger.begin(57600);

  if (finger.verifyPassword()) {
    Serial.println("Fingerprint sensor found");
  } else {
    updateDisplay("Sensor ERR", "Check R307");
    while (true) {
      delay(1000);
    }
  }

  updateDisplay("READY", "Scan finger");
}

void loop() {
  if (finger.getImage() != FINGERPRINT_OK) {
    delay(40);
    return;
  }

  updateDisplay("READING...");

  if (finger.image2Tz() != FINGERPRINT_OK) {
    updateDisplay("TRY AGAIN", "Bad image");
    delay(1200);
    updateDisplay("READY", "Scan finger");
    return;
  }

  if (finger.fingerFastSearch() != FINGERPRINT_OK) {
    updateDisplay("DENIED", "Not in sensor DB");
    beepDenied();
    delay(1500);
    updateDisplay("READY", "Scan finger");
    return;
  }

  const uint16_t fingerprintId = finger.fingerID;
  updateDisplay("SENDING", "ID #" + String(fingerprintId));

  ScanResult result = notifyScanToApi(fingerprintId);

  if (result == SCAN_MATCHED) {
    updateDisplay("WELCOME", "ID #" + String(fingerprintId));
    beepSuccess();
  } else if (result == SCAN_UNKNOWN) {
    // Sensor knows this fingerprint ID, but backend has no linked student profile yet.
    // Web app will receive scan:unknown event and show enrollment form.
    updateDisplay("NEW USER", "Enroll on web");
    beepDenied();
  } else {
    updateDisplay("API ERROR", "Check backend");
    beepDenied();
  }

  delay(1800);
  updateDisplay("READY", "Scan finger");
}
