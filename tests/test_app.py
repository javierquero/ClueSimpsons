import http.server
import socketserver
import threading
import unittest

from playwright.sync_api import sync_playwright


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class ClueAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ReusableTCPServer(("127.0.0.1", 8765), QuietHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1000, "height": 900})
        self.page = self.context.new_page()
        self.page.goto("http://127.0.0.1:8765/", wait_until="domcontentloaded")
        self.page.evaluate("localStorage.clear()")
        self.page.reload(wait_until="domcontentloaded")

    def tearDown(self):
        self.context.close()

    def start_game(self):
        self.page.get_by_text("¡Empezar Juego!").click()
        required = int(self.page.locator("#my-cards-count-select").input_value())
        cards = self.page.locator('input[name="myhand-card"]')
        for index in range(required):
            cards.nth(index).check()
        self.page.locator("#btn-confirm-hand").click()
        self.page.evaluate("closeQuickGuide(true)")

    def test_normal_cycle_never_adds_check(self):
        self.start_game()
        cell = self.page.locator("#table-body tr").filter(has_text="Sra. Blanco").locator("td").nth(2)
        states = [cell.inner_text()]
        for _ in range(6):
            cell.click()
            states.append(cell.inner_text())
        self.assertEqual(states, ["", "❌", "?", "1", "2", "3", ""])

    def test_long_press_and_undo(self):
        self.start_game()
        row = self.page.locator("#table-body tr").filter(has_text="Sra. Blanco")
        cell = row.locator("td").nth(3)
        box = cell.bounding_box()
        self.page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        self.page.mouse.down()
        self.page.wait_for_timeout(650)
        self.page.mouse.up()
        self.assertEqual([row.locator("td").nth(i).inner_text() for i in range(1, 5)], ["❌", "❌", "✔️", "❌"])
        self.page.evaluate("undoLastAction()")
        self.assertEqual([row.locator("td").nth(i).inner_text() for i in range(1, 5)], ["❌", "", "", ""])

    def test_quick_guide_is_automatic_only_once(self):
        self.page.get_by_text("¡Empezar Juego!").click()
        required = int(self.page.locator("#my-cards-count-select").input_value())
        cards = self.page.locator('input[name="myhand-card"]')
        for index in range(required):
            cards.nth(index).check()
        self.page.locator("#btn-confirm-hand").click()
        self.page.wait_for_timeout(250)
        self.assertTrue(self.page.locator("#quick-guide-modal").is_visible())
        self.page.evaluate("closeQuickGuide(true)")
        self.page.reload(wait_until="domcontentloaded")
        self.page.wait_for_timeout(250)
        self.assertFalse(self.page.locator("#quick-guide-modal").is_visible())
        self.page.evaluate("openQuickGuide(false)")
        self.assertTrue(self.page.locator("#quick-guide-modal").is_visible())

    def test_guess_modal_fits_mobile_and_audio_is_prepared(self):
        self.start_game()
        self.page.set_viewport_size({"width": 375, "height": 667})
        self.page.evaluate("selectForGuess('Coronel Mostaza'); selectForGuess('Collar'); selectForGuess('Bolerama'); openGuessModal()")
        dimensions = self.page.evaluate("""() => {
            const modal = document.querySelector('#guess-modal .bottom-sheet-inner');
            return { client: modal.clientHeight, scroll: modal.scrollHeight };
        }""")
        self.assertLessEqual(dimensions["scroll"], dimensions["client"])
        self.assertTrue(self.page.evaluate("audioCtx !== null"))

    def test_audio_expands_abbreviated_suspect_name(self):
        spoken = self.page.evaluate("""() => {
            let result = '';
            const originalSpeak = window.speechSynthesis.speak;
            window.speechSynthesis.speak = utterance => { result = utterance.text; };
            speakSolution('Srita. Escarlata', 'Collar', 'Bolerama');
            return new Promise(resolve => setTimeout(() => {
                window.speechSynthesis.speak = originalSpeak;
                resolve(result);
            }, 20));
        }""")
        self.assertIn("fue señorita Escarlata", spoken)
        self.assertNotIn("Srita.", spoken)

    def test_accessibility_and_local_styles(self):
        self.start_game()
        self.assertEqual(self.page.locator('script[src*="tailwindcss.com"]').count(), 0)
        self.assertEqual(self.page.locator('link[href="tailwind.css"]').count(), 1)
        cell = self.page.locator('#table-body td[role="button"]').nth(1)
        self.assertTrue(cell.get_attribute('aria-label'))
        self.assertEqual(self.page.locator('#guess-modal').get_attribute('role'), 'dialog')

    def test_header_donuts_use_slow_side_animations(self):
        self.page.set_viewport_size({"width": 375, "height": 667})
        animations = self.page.locator('header .header-donut').evaluate_all("""images => images.map(image => {
            const style = getComputedStyle(image);
            return { name: style.animationName, duration: style.animationDuration };
        })""")
        self.assertEqual(animations, [
            {"name": "donutRollFromLeft", "duration": "2s"},
            {"name": "donutRollFromRight", "duration": "2s"}
        ])
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 375)
        self.page.wait_for_timeout(1000)
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 375)

    def test_update_activates_waiting_worker(self):
        messages = self.page.evaluate("""() => {
            const received = [];
            applyAppUpdate({ postMessage: message => received.push(message) });
            return received;
        }""")
        self.assertEqual(messages, [{"type": "SKIP_WAITING"}])

    def test_completed_update_uses_action_toast_once(self):
        self.page.evaluate("sessionStorage.setItem('clue_update_completed', '1')")
        self.page.reload(wait_until="domcontentloaded")
        toast = self.page.locator('#action-toast')
        self.page.wait_for_timeout(250)
        self.assertEqual(toast.inner_text(), 'Aplicación actualizada.')
        self.assertFalse(toast.evaluate("element => element.classList.contains('hidden')"))
        self.assertIsNone(self.page.evaluate("sessionStorage.getItem('clue_update_completed')"))

    def test_new_game_uses_styled_confirmation(self):
        self.start_game()
        self.page.evaluate("openConfigModal()")
        self.page.locator('#config-modal').get_by_text('¡Empezar Juego!').click()
        confirmation = self.page.locator('#new-game-confirm-modal')
        self.assertTrue(confirmation.is_visible())
        self.assertTrue(self.page.evaluate('gameState.handLocked'))
        confirmation.get_by_text('Cancelar').click()
        self.assertFalse(confirmation.is_visible())
        self.page.locator('#config-modal').get_by_text('¡Empezar Juego!').click()
        confirmation.get_by_text('Empezar nueva').click()
        self.assertFalse(self.page.evaluate('gameState.handLocked'))
        self.assertTrue(self.page.locator('#myhand-modal').is_visible())

    def test_history_delete_uses_styled_confirmation(self):
        self.start_game()
        self.page.evaluate("""() => {
            gameState.history = [{
                suspect: 'Coronel Mostaza', weapon: 'Collar', place: 'Bolerama', responses: []
            }];
            saveState();
            openGuessModal();
        }""")
        self.page.locator('#guess-modal-history button[aria-label="Eliminar registro"]').click()
        confirmation = self.page.locator('#delete-history-confirm-modal')
        self.assertTrue(confirmation.is_visible())
        confirmation.get_by_text('Cancelar').click()
        self.assertEqual(self.page.evaluate('gameState.history.length'), 1)
        self.page.locator('#guess-modal-history button[aria-label="Eliminar registro"]').click()
        confirmation.get_by_text('Eliminar', exact=True).click()
        self.assertEqual(self.page.evaluate('gameState.history.length'), 0)
        self.assertEqual(self.page.locator('#action-toast').inner_text(), 'Entrada eliminada. Podés recuperarla con Deshacer.')

    def test_invalid_storage_recovers_default_state(self):
        self.page.evaluate("localStorage.setItem('simpsons_clue_state', JSON.stringify({started:true,players:['x'],matrix:'bad'}))")
        self.page.reload(wait_until="domcontentloaded")
        self.assertFalse(self.page.evaluate("gameState.started"))
        self.assertEqual(self.page.evaluate("gameState.players"), ["J1", "J2", "J3", "J4"])


if __name__ == "__main__":
    unittest.main()
