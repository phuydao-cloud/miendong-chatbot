/*!
 * Widget AI v3.0 - Trường Cao đẳng Miền Đông
 * Đóng gói từ Widget AI v2.2
 * Cách nhúng sau khi ghép và đổi tên thành widget.js:
 * <script src="https://chatbot.cdmd.edu.vn/widget.js"></script>
 *
 * HƯỚNG DẪN GHÉP:
 * 1) Mở widget_1.js.html và widget_2.js.html bằng Notepad/VS Code.
 * 2) Copy toàn bộ nội dung widget_1.js.html.
 * 3) Copy tiếp toàn bộ nội dung widget_2.js.html dán NGAY SAU nội dung phần 1.
 * 4) Lưu thành widget.js.
 */

(function () {
    "use strict";

    const WIDGET_ID = "md-ai-widget";
    const STYLE_ID = "md-ai-widget-style";

    if (document.getElementById(WIDGET_ID)) {
        return;
    }

    const html = `
<div id="md-ai-widget">
    <div id="md-ai-welcome">
        <div class="md-ai-title">👋 Xin chào!</div>
        <div class="md-ai-text">
            Tôi là <b>AI Tư vấn tuyển sinh</b> của Trường Cao đẳng Miền Đông.<br>
            Bấm vào biểu tượng chat để được hỗ trợ tư vấn nhanh.
        </div>
    </div>

    <button id="md-ai-button" aria-label="Mở chatbot" title="Mở chatbot tư vấn tuyển sinh">
        💬 <span class="md-ai-button-text">Tư vấn online</span>
    </button>

    <div id="md-ai-panel">
        <div id="md-ai-header">
            <div>
                <div class="md-ai-header-title">🤖 Tư vấn tuyển sinh 24/7</div>
            </div>

            <div class="md-ai-actions">
                <button id="md-ai-fullscreen" title="Mở rộng khung chat">⛶</button>
                <a id="md-ai-open" href="https://chatbot.cdmd.edu.vn" target="_blank" title="Mở trang chatbot">↗</a>
                <button id="md-ai-close" title="Đóng">×</button>
            </div>
        </div>

        <iframe id="md-ai-frame" src="https://chatbot.cdmd.edu.vn" title="Tư vấn tuyển sinh Trường Cao đẳng Miền Đông">
        </iframe>
    </div>
</div>
`;

    const css = `
#md-ai-widget {
    position: fixed;
    right: 22px;
    bottom: 22px;
    z-index: 999999;
    font-family: Arial, sans-serif;
}

#md-ai-welcome {
    position: absolute;
    right: 0;
    bottom: 70px;
    width: 255px;
    background: #ffffff;
    color: #1f2937;
    padding: 14px 16px;
    border-radius: 16px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
    border-left: 5px solid #2563eb;
    animation: mdFadeZoom .3s ease;
    text-align: justify;
}

.md-ai-title {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 5px;
    color: #2563eb;
}

.md-ai-text {
    font-size: 14px;
    line-height: 1.45;
    color: #00893A;
}

#md-ai-button {
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    border-radius: 999px;
    background: linear-gradient(135deg, #2563eb, #38bdf8);
    color: white;
    padding: 11px 13px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
    animation: mdPulse 2.6s infinite;
}

#md-ai-panel {
    display: none;
    position: absolute;
    right: 0;
    bottom: 70px;
    width: min(430px, 95vw);
    height: min(700px, 88vh);
    max-height: calc(100vh - 100px);
    background: #ffffff;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
    animation: mdFadeZoom .25s ease;
}

#md-ai-panel.md-ai-expanded {
    width: 860px;
    height: 82vh;
    max-width: calc(100vw - 44px);
}

#md-ai-header {
    height: 40px;
    background: linear-gradient(135deg, #0891b2, #38bdf8);
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px 0 14px;
}

.md-ai-header-title {
    font-weight: 700;
    font-size: 15px;
}

.md-ai-header-sub {
    font-size: 11.5px;
    opacity: 0.95;
    margin-top: 1px;
}

.md-ai-actions {
    display: flex;
    align-items: center;
    gap: 7px;
}
#md-ai-fullscreen,
#md-ai-open,
#md-ai-close {
    color: white;
    text-decoration: none;
    background: rgba(255, 255, 255, 0.18);
    border: none;
    width: 29px;
    height: 29px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    cursor: pointer;
}

#md-ai-close {
    font-size: 25px;
    line-height: 1;
}

#md-ai-fullscreen:hover,
#md-ai-open:hover,
#md-ai-close:hover {
    background: rgba(255, 255, 255, 0.3);
}

#md-ai-frame {
    width: 100%;
    height: calc(100% - 40px);
    border: none;
}

@keyframes mdFadeZoom {
    from {
        opacity: 0;
        transform: translateY(10px) scale(0.97);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes mdPulse {

    0%,
    100% {
        transform: scale(1);
    }

    50% {
        transform: scale(1.05);
    }
}

@media (max-width: 640px) {
    #md-ai-widget {
        right: 12px;
        bottom: 12px;
    }

    #md-ai-welcome {
        width: 260px;
        bottom: 66px;
    }

    #md-ai-panel,
    #md-ai-panel.md-ai-expanded {
        width: calc(100vw - 24px);
        height: 78vh;
        right: 0;
        bottom: 66px;
        border-radius: 18px;
    }

    #md-ai-fullscreen {
        display: none;
    }

    .md-ai-button-text {
        display: none;
    }

    #md-ai-button {
        width: 58px;
        height: 58px;
        padding: 0;
        justify-content: center;
        font-size: 27px;
    }
}
`;

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.type = "text/css";
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function injectWidget() {
        document.body.insertAdjacentHTML("beforeend", html);
    }

    function initWidget() {
        const button = document.getElementById("md-ai-button");
        const panel = document.getElementById("md-ai-panel");
        const close = document.getElementById("md-ai-close");
        const welcome = document.getElementById("md-ai-welcome");
        const fullscreen = document.getElementById("md-ai-fullscreen");

        if (!button || !panel || !close || !welcome || !fullscreen) {
            return;
        }

        button.addEventListener("click", function () {
            panel.style.display = "block";
            button.style.display = "none";
            welcome.style.display = "none";
            sessionStorage.setItem("md_ai_welcome_closed", "1");
        });

        close.addEventListener("click", function () {
            panel.style.display = "none";
            panel.classList.remove("md-ai-expanded");
            button.style.display = "flex";
        });

        fullscreen.addEventListener("click", function () {
            panel.classList.toggle("md-ai-expanded");
            fullscreen.textContent = panel.classList.contains("md-ai-expanded") ? "▣" : "⛶";
        });

        if (sessionStorage.getItem("md_ai_welcome_closed") === "1") {
            welcome.style.display = "none";
        } else {
            setTimeout(function () {
                welcome.style.display = "block";
            }, 1000);

            setTimeout(function () {
                welcome.style.display = "none";
            }, 12000);
        }
    }

    function start() {
        injectStyle();
        injectWidget();
        initWidget();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();

