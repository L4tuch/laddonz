# L4Tools — dodatki do Margonem (nowy interfejs)

Panel dodatków w formie skryptu Tampermonkey. Nowoczesny, przezroczysty panel konfiguracyjny z ikonką dla każdego dodatku.

**Zasady, na których zbudowany jest panel**

- **Jedno naciśnięcie = jedna akcja.** Przytrzymanie klawisza nic nie spamuje, skróty nie działają podczas pisania na czacie.
- **Automaty są domyślnie wyłączone** (oznaczone w panelu literą **A** i żółtą plakietką). Włączasz je świadomie, po ostrzeżeniu.
- **Nic nie jest zużywane bez Twojej zgody.** Ulepszarka ulepsza tylko na Twoje polecenie (przycisk albo klawisz) i domyślnie pokazuje listę zużywanych przedmiotów z ich rzadkością.
- **Komendy usuwania i ulepszania są zablokowane**, dopóki sam ich nie „pokażesz" panelowi (patrz: [Pierwsze uruchomienie](#4-pierwsze-uruchomienie--weryfikacja-komend)).
- **Wszystko przechodzi przez jedną kolejkę** z minimalnym odstępem (300 ms).

> ⚠️ Żaden dodatek firm trzecich nie jest oficjalnie zatwierdzony przez Garmory. Funkcje działające bez kliknięcia (Dobijarka, Szybka walka, Fake Taxi, Szybka Rączka) to dokładnie ten rodzaj rzeczy, za który najłatwiej o bana. Używasz ich na własne ryzyko.

---

## Dodatki

| | Dodatek | Co robi |
|---|---|---|
| ⚔ | **Dobijarka** | Włączona: atakuje każdego gracza, który wejdzie w zasięg (zakres poziomów od–do). Klawisz (działa też przy wyłączonej): namierza najbliższego gracza i atakuje go, gdy będzie w zasięgu. W menu gracza: „Dobij" / „Przerwij dobijanie". Postać nigdy sama nie podchodzi. |
| 🔔 | **Hey WakeUP!** | Domyślnie powiadomienia wyglądają jak w grze (żółty tekst na dole). Dodatek zmienia ich kolory, czcionkę, rozmiar, tło i położenie — także dla komunikatów gry. |
| 🛡 | **Bratan** | Blokuje każdy atak (także ręczny) na klanowiczów, znajomych, sojuszników i osoby z listy. |
| ◎ | **Wrogowie na mapie** | Na czerwonych mapach komunikat gry „Wróg na mapie: Nick", gdy pojawi się wróg. Do wyboru: wrogie klany, oznaczeni wrogowie, neutralni (bez relacji). Znajomi, klan, sojusz, grupa i lista Bratana — nigdy. |
| 👥 | **Gracze na mapie+** | Okno z graczami na mapie: filtry, sortowanie, zapisywane zestawy, tryb minimalny. Klik na gracza → karta z EQ, Dobij, zaproszeniem do grupy i znajomych, Bratanem. |
| 🏆 | **Kto złapie** | Pod kafelkami łupu: Twoja szansa (%) na złapanie przedmiotu — tylko w walce w grupie; liczone osoby z Twojej drużyny, które brały udział w walce, z pierwszeństwem pasującej profesji. |
| 🍲 | **Let's Cook Together** | Klawisz = zaproś znajomych/klan/sojusz/wszystkich z mapy. Klawisz = rozwiąż grupę. Bez automatów. |
| ✎ | **Podpisownik** | Własne podpisy na przedmiotach (np. dokąd prowadzi kamień teleportacyjny). |
| 🎒 | **Pokaż EQ** | Najedź na gracza (domyślnie z Shift) → jego ekwipunek + podsumowanie bonusów legendarnych. |
| ★ | **Jaki To Bon** | Skrót bonusu legendarnego w rogu przedmiotu (OR, CBK, DA…). Skróty edytowalne. |
| 🚕 | **Fake Taxi** | Włączony = od razu przyjmuje przywołanie drużyny („…przyzywa do siebie swoją drużynę!") — okno z pytaniem w ogóle się nie pokazuje. Bez ustawień. |
| ⚡ | **Szybka walka** | Włącz/wyłącz: gdy włączony, każda walka od razu przechodzi na szybką walkę (np. przy kolosie, gdy odchodzisz od komputera). |
| ✋ | **Szybka Rączka** | Prawy klik na przedmiocie → „Użyj po walce" — po walce przedmiot jest używany od razu (jak „Użyj" z menu). Ikonka zegara na przedmiocie. Prawy klik na ikonie grupy → „Rozwiąż grupę po walce". Prawy (albo lewy) klik na numerze zestawu przy EQ → w liście zestawów gry pozycja „Zmień po walce…" → wybierz zestaw; przy numerze pojawia się zegar, a zestaw zmieni się zaraz po walce. |
| ✦ | **Ulepszarka** | Przeciągasz (albo wskazujesz) przedmiot do ulepszania i wybierasz, czym go karmić: rzadkość (zwykłe / unikaty / heroiki — nigdy legendy) i typy (hełm, pierścień, naszyjnik…). Każdy typ składników może karmić tylko jeden przedmiot — gdy wszystkie typy są zajęte, kolejnego przedmiotu nie dodasz. Ulepszasz przyciskiem „Ulepsz teraz" albo klawiszem — zwykłe ulepszanie z gry, tylko kilka przedmiotów naraz. Okno rzemiosła zamyka się samo. Opcjonalnie ulepsza sama, gdy w torbie zostanie N wolnych miejsc (0 = pełna torba). Nie przepala składników ponad to, czego brakuje do poziomu; pilnuje dziennego limitu. |
| 🎨 | **Motywnik** | Style całego interfejsu dopasowane do budowy gry: Domyślny (klasyczny), Dark Theme, Zorza, Neon, Obsydian, Głębia. Ramy ekranu, paski, okna, zakładki, przyciski, menu, sloty, dymki, czat i krój pisma — bez zmiany rozmiarów. Własne style CSS. |
| 💬 | **MiniChat** | Rozmiar, czcionka i przezroczystość czatu, zwijanie pod klawisz. |

**Czego Ulepszarka nigdy nie użyje:** założonych przedmiotów, legend, artefaktów, przedmiotów ulepszonych, innych ulepszanych celów, podpisanych w Podpisowniku, z kolejki Szybkiej rączki i oznaczonych „Chroń przed Ulepszarką".


---

## 1. Wrzucenie na GitHub (krok po kroku, bez instalowania czegokolwiek)

1. Zaloguj się na **github.com**.
2. Prawy górny róg → **+** → **New repository**.
3. *Repository name*: `laddonz`. Zaznacz **Public** (wymagane, żeby Tampermonkey mógł pobierać aktualizacje). Kliknij **Create repository**.
4. Na stronie nowego repo kliknij link **uploading an existing file**.
5. Rozpakuj `laddonz.zip` na komputerze. Zaznacz **całą zawartość folderu** `laddonz` (foldery `src`, `dist`, `test` i pliki `README.md`, `build.js` itd.) i **przeciągnij** na stronę GitHuba. Poczekaj, aż wszystkie pliki się wgrają.
6. Na dole wpisz opis, np. `Pierwsza wersja`, i kliknij **Commit changes**.
7. Ustaw swój login w linkach aktualizacji:
   - wejdź w plik `dist/laddonz.user.js` → ikonka ołówka (**Edit**),
   - w liniach `@namespace`, `@updateURL`, `@downloadURL`, `@supportURL` zamień `L4tuch` na swój login z GitHuba (4 miejsca na samej górze pliku),
   - **Commit changes**.
   - Zrób to samo w pliku `build.config.json` (pole `githubUser`), żeby kolejne buildy miały dobre linki.

## 2. Instalacja w przeglądarce (Brave / Chrome)

1. Zainstaluj **Tampermonkey** ze sklepu Chrome Web Store (działa też w Brave).
2. **Włącz skrypty użytkownika** — bez tego Tampermonkey nic nie uruchomi:
   - **Chrome:** wejdź w `chrome://extensions` → przy Tampermonkey kliknij **Szczegóły** → włącz **Zezwalaj na skrypty użytkownika** (Allow User Scripts). W starszych wersjach Chrome zamiast tego włącz **Tryb dewelopera** w prawym górnym rogu.
   - **Brave:** wejdź w `brave://extensions` → włącz **Tryb dewelopera** w prawym górnym rogu; jeśli przy Tampermonkey jest przełącznik **Zezwalaj na skrypty użytkownika**, włącz go też.
3. Otwórz w przeglądarce adres (z Twoim loginem):
   ```
   https://raw.githubusercontent.com/L4tuch/laddonz/refs/heads/main/dist/laddonz.user.js
   ```
4. Tampermonkey pokaże ekran instalacji → **Zainstaluj**.
5. Wejdź do gry. Po wczytaniu postaci po lewej pojawi się szklana ikonka ⬡. Panel otwierasz ikonką albo klawiszem **F8**.

## 3. Aktualizacje

Gdy zmienisz coś w repozytorium, podbij numer wersji w nagłówku (`@version 1.0.1`) — Tampermonkey sam pobierze nową wersję (albo: ikona Tampermonkey → Panel → „Sprawdź aktualizacje").

Jeśli zmieniasz pliki w `src/`, przebuduj skrypt: `node build.js` (wymaga tylko Node.js, bez dodatkowych paczek), a potem wrzuć nowy `dist/laddonz.user.js`.

## 4. Pierwsze uruchomienie

Nic nie trzeba ustawiać — komendy gry są wbudowane. Włącz potrzebne dodatki w zakładce **Dodatki**, a te, których używasz najczęściej, dodaj do skrótów (pasek po prawej).

## 5. Gdy coś nie działa

- **Panel się nie pokazuje:** sprawdź, czy grasz na nowym interfejsie i czy w Tampermonkey skrypt jest włączony (zielony przełącznik). F12 → Konsola → szukaj wpisów `[L4Tools]`.
- **Liczby/plakietki nie pojawiają się na oknie (łup, czat, ikona grupy, przywołanie):** gra mogła zmienić nazwę klasy okna. F12 → strzałka „wskaż element" → kliknij okno → skopiuj jego klasę (np. `.loot-wnd`) do pola *Selektor…* w ustawieniach dodatku.
- **Menu prawego przycisku nie ma nowych opcji:** zapasowo **Alt + prawy klik** na przedmiocie zawsze otwiera menu panelu, a Dobij jest też dostępne w oknie „Gracze na mapie+".
- **Kopia ustawień:** Ogólne → Eksportuj / Importuj.
- **Raport dla twórcy:** Ogólne → „Kopiuj raport" — wklej go w rozmowie, gdy coś nie działa.

## Diagnostyka (gdy coś nie działa w Twojej wersji gry)

Plik `test/diagnostyka.js`: skopiuj całość, w grze naciśnij F12 → Console, wklej i Enter. Przez 60 s skrypt tylko podgląda, co robi gra (nic nie wysyła). Wykonaj w tym czasie akcje z opisu na górze pliku. Potem pobierze się `laddonz-diagnostyka.txt`.

## Testowanie bez gry

`test/mock.html` to makieta gry (fałszywy `Engine` i `_g`). Otwórz ją w przeglądarce z włączonym skryptem albo wklej zawartość `dist/laddonz.user.js` w konsolę F12 na tej stronie — zobaczysz panel i możesz sprawdzić wszystkie dodatki bez ryzyka. Wysłane komendy lądują w `window.SENT`.

## Struktura projektu

```
src/core/game.js        ← jedyne miejsce dotykające wnętrza gry (Engine, _g) — tu poprawiasz po aktualizacji gry
src/core/net.js         ← kolejka, bezpieczniki, tryb próbny, blokada akcji niszczących, podsłuch
src/core/ui.js          ← panel (zakładki, formularze)
src/core/styles.js      ← wygląd (szkło, kolory)
src/core/icons.js       ← ikonki SVG
src/addons/*.js         ← dodatki
build.js                ← składa wszystko w dist/laddonz.user.js
```

Licencja: MIT.
