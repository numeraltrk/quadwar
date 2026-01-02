# Quadratic War

**Quadratic War** is an abstract strategy game where algebra meets warfare. Form equations, eliminate enemies, and master the grid.

![Quadratic War Banner](assets/icons/icon-512x512.png)

## 🎮 Features

-   **Multiple Game Modes**:
    -   **VS Player (Local)**: Play against a friend on the same device.
    -   **VS Computer**: Challenge the AI to test your skills.
    -   **Online PvP**: Battle opponents in real-time using PeerJS.
-   **Progressive Web App (PWA)**: Installable on mobile and desktop for a native app experience.
-   **Responsive Design**: optimized for both desktop and mobile play.

## 🕹️ How to Play

### Objective
Form quadratic equations **$ax^2 + bx + c = 0$** using adjacent pieces (horizontally, vertically, or diagonally) to eliminate your opponent's pieces.

### Pieces & Movement
-   **Quadratic ($x^2$)**: Moves up to **3 spaces** (Diagonal or Straight).
-   **Linear ($x$)**: Moves up to **2 spaces** (Straight only).
-   **Constant ($1$)**: Moves **1 space** forward.

### Resolution
When an equation is formed, the discriminant **$\Delta = b^2 - 4ac$** determines the outcome:

-   **$\Delta \ge 0$ (Real Roots)**: The equation is valid. You destroy the opponent's pieces involved in the equation.
-   **$\Delta < 0$ (Complex Roots)**: The equation is unstable. Your own pieces backfire and are destroyed!

## 🛠️ Technologies Used

-   **Frontend**: HTML5, CSS3, Vanilla JavaScript
-   **Multiplayer**: [PeerJS](https://peerjs.com/) (WebRTC)
-   **PWA**: Service Workers, Web App Manifest
-   **Design**: Custom CSS variables, responsive grid layout

## 📄 License

**Proprietary License**

Copyright (C) 2026 Numeral Maths Club - TRKHSS Vaniyamkulam. All Rights Reserved.

This project is for **public viewing only**. No license is granted to use, copy, modify, or distribute the software or its underlying concepts. Unauthorized use of the unique algebraic game mechanics is strictly prohibited.

See the [LICENSE](LICENSE) file for the full proprietary license terms.

---
Copyright (c) 2026 Numeral Maths Club - TRKHSS Vaniyamkulam