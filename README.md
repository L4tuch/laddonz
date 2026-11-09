# laddonz — legalne dodatki do Margonem (nowy interfejs)

Panel dodatków w formie skryptu Tampermonkey. Nowoczesny, przezroczysty panel konfiguracyjny z ikonką dla każdego dodatku.

**Zasady, na których zbudowany jest panel**

- **Jedno naciśnięcie = jedna akcja.** Przytrzymanie klawisza nic nie spamuje, skróty nie działają podczas pisania na czacie.
- **Automaty są domyślnie wyłączone** (oznaczone w panelu literą **A** i żółtą plakietką). Włączasz je świadomie, po ostrzeżeniu.
- **Nic nie jest usuwane ani zużywane bez potwierdzenia.** Śmieciara i Ulepszarka zawsze pokazują listę przedmiotów i odliczają 2–3 s na przycisku.
- **Komendy usuwania i ulepszania są zablokowane**, dopóki sam ich nie „pokażesz" panelowi (patrz: [Pierwsze uruchomienie](#4-pierwsze-uruchomienie--weryfikacja-komend)).
- **Wszystko przechodzi przez jedną kolejkę** z minimalnym odstępem (domyślnie 300 ms) i jest zapisywane w zakładce **Log**.
- **Tryb próbny** (Ogólne → Tryb próbny): panel niczego nie wysyła, tylko zapisuje w logu, co by zrobił.

> ⚠️ Żaden dodatek firm trzecich nie jest oficjalnie zatwierdzony przez Garmory. Funkcje automatyczne (Napad AUTO, Auto f, Fake Taxi, automat Szybkiej rączki i Ulepszarki, auto-zaproszenia) to dokładnie ten rodzaj rzeczy, za który najłatwiej o bana. Używasz ich na własne ryzyko.

---

## Dodatki

| | Dodatek | Co robi |
|---|---|---|
| ⚔ | **Napad** | Klawisz = atak na najbliższego wroga w zasięgu (bez podchodzenia). „⚔ Napad" w menu prawego przycisku na graczu. Pamięta ochronę i nie marnuje na nią ataków. Zmiana zestawu przed atakiem (opcjonalnie tylko gdy na mapie jest 1 wróg). **Tryb AUTO** (domyślnie wyłączony): atakuje graczy wchodzących w zasięg według tych samych filtrów; gdy działa, na ekranie świeci czerwony wskaźnik „NAPAD AUTO" (klik = wyłącz). |
| 🔔 | **Hey WakeUP!** | Domyślnie powiadomienia wyglądają jak w grze (żółty tekst na dole). Dodatek zmienia ich kolory, czcionkę, rozmiar, tło i położenie — także dla komunikatów gry. |
| 🛡 | **Bratan** | Blokuje każdy atak (także ręczny) na klanowiczów, znajomych, sojuszników i osoby z listy. |
| 👥 | **Kto tu jest?** | Okno z graczami na mapie: filtry, sortowanie, zapisywane zestawy, tryb minimalny. Klik na gracza → karta z EQ, Napadem, zaproszeniem do grupy i znajomych, Bratanem. |
| 🏆 | **Kto złapie** | Pod kafelkami łupu: Twoja szansa (%) na złapanie przedmiotu przy biciu w grupie. |
| 🍲 | **Let's Cook Together** | Klawisz = zaproś znajomych/klan/sojusz/wszystkich z mapy. Klawisz = rozwiąż grupę. Opcjonalny automat. |
| ✎ | **Podpisownik** | Własne podpisy na przedmiotach (np. dokąd prowadzi kamień teleportacyjny). |
| 🎒 | **Pokaż EQ** | Najedź na gracza (domyślnie z Shift) → jego ekwipunek + podsumowanie bonusów legendarnych. |
| ★ | **Jaki To Bon** | Skrót bonusu legendarnego w rogu przedmiotu (OR, CBK, DA…). Skróty edytowalne. |
| 🗑 | **Śmieciara** | Usuwa tylko przedmioty po terminie ważności, po potwierdzeniu listy. |
| 🚕 | **Fake Taxi** | Automatyczne przyjmowanie przywołań od wybranych osób. |
| ⚡ | **Auto f** | Włącz/wyłącz: gdy włączony, każda walka od razu przechodzi na szybką walkę (np. przy kolosie, gdy odchodzisz od komputera). |
| ✋ | **Szybka rączka** | Prawy klik na przedmiocie → „Użyj po walce". Prawy klik na ikonie grupy → „Rozwiąż grupę po walce". |
| ✦ | **Ulepszarka** | Ulepsza wybrany przedmiot składnikami z torby wg rzadkości (zwykłe / unikaty / heroiki). Pod klawisz albo po walce. |
| 💬 | **MiniChat** | Rozmiar, czcionka i przezroczystość czatu, zwijanie pod klawisz. |

**Czego Ulepszarka nigdy nie użyje jako składnika:** założonych przedmiotów, legend, artefaktów, przedmiotów ulepszonych, podpisanych w Podpisowniku, z kolejki Szybkiej rączki i oznaczonych „🔒 Chroń przed Ulepszarką". Heroiki tylko po osobnym potwierdzeniu.

**Czego Śmieciara nigdy nie usunie:** przedmiotów z ważnym terminem, założonych, podpisanych i z listy „Nigdy nie usuwaj". Tuż przed każdym usunięciem ważność jest sprawdzana jeszcze raz.

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
   https://raw.githubusercontent.com/L4tuch/laddonz/main/dist/laddonz.user.js
   ```
4. Tampermonkey pokaże ekran instalacji → **Zainstaluj**.
5. Wejdź do gry. Po wczytaniu postaci po lewej pojawi się szklana ikonka ⬡. Panel otwierasz ikonką albo klawiszem **F8**.

## 3. Aktualizacje

Gdy zmienisz coś w repozytorium, podbij numer wersji w nagłówku (`@version 1.0.1`) — Tampermonkey sam pobierze nową wersję (albo: ikona Tampermonkey → Panel → „Sprawdź aktualizacje").

Jeśli zmieniasz pliki w `src/`, przebuduj skrypt: `node build.js` (wymaga tylko Node.js, bez dodatkowych paczek), a potem wrzuć nowy `dist/laddonz.user.js`.

## 4. Pierwsze uruchomienie — weryfikacja komend

Panel komunikuje się z grą tymi samymi komendami, które wysyła sama gra. Część z nich zna z góry, części musi się „nauczyć", podglądając Twoją ręczną akcję. **To celowe** — dzięki temu panel nigdy nie wyśle komendy usuwania czy ulepszania, której nie widziałeś na własne oczy.

1. Otwórz panel → **Ogólne** → włącz **Tryb próbny**. Pobaw się dodatkami i sprawdź w zakładce **Log**, co panel *by* wysłał.
2. Wejdź w **Diagnostyka** → sekcja *Punkty zaczepienia*. Wszystko powinno mieć ✔. Jeśli coś ma ✘, zapisz które — to miejsce do poprawki w `src/core/game.js`.
3. Dla każdej komendy ze statusem **do ustawienia** / **zablokowana** wykonaj daną akcję **ręcznie w grze** (opis jest przy komendzie), np.:
   - *Usunięcie przedmiotu* → usuń ręcznie jeden bezwartościowy przedmiot,
   - *Ulepszenie przedmiotu* → ulepsz ręcznie dowolny przedmiot jednym składnikiem,
   - *Zmiana zestawu* → przełącz zestaw ekwipunku,
   - *Podgląd EQ gracza* → kliknij u kogoś „Pokaż ekwipunek".
4. Zaraz po tym w sekcji **Podsłuch** pojawi się wysłana przez grę komenda. Przy niej wybierz z listy **Przypisz do…** właściwą akcję. Panel pokaże szablon (np. `…&id={id}`) — zatwierdź.
5. Wyłącz **Tryb próbny**. Gotowe.

Komendy z pomarańczowym statusem **domyślna** (atak, szybka walka, zaproszenie, rozwiązanie grupy, użycie przedmiotu) to najlepsze znane domyślne wartości. Jeśli któraś akcja nie działa, zweryfikuj ją tak samo przez Podsłuch.

## 5. Gdy coś nie działa

- **Panel się nie pokazuje:** sprawdź, czy grasz na nowym interfejsie i czy w Tampermonkey skrypt jest włączony (zielony przełącznik). F12 → Konsola → szukaj wpisów `[laddonz]`.
- **Liczby/plakietki nie pojawiają się na oknie (łup, czat, ikona grupy, przywołanie):** gra mogła zmienić nazwę klasy okna. F12 → strzałka „wskaż element" → kliknij okno → skopiuj jego klasę (np. `.loot-wnd`) do pola *Selektor…* w ustawieniach dodatku.
- **Menu prawego przycisku nie ma nowych opcji:** sprawdź Diagnostykę. Zapasowo: **Alt + prawy klik** na przedmiocie zawsze otwiera menu panelu, a Napad jest też dostępny w oknie „Kto tu jest?".
- **Kopia ustawień:** Ogólne → Eksportuj / Importuj.

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
