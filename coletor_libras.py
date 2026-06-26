# -*- coding: utf-8 -*-
"""
Coletor de Amostras de LIBRAS (Sinais/Landmarks) para LibrasLens
Desenvolvido para coletar pontos das mãos (21 landmarks x, y, z) usando a webcam
e exportar em formato CSV compatível com o importador do site.

Requisitos de instalação:
    pip install opencv-python mediapipe pandas numpy

Como usar:
1. Execute o script: python coletor_libras.py
2. Escolha o caractere que deseja gravar (Ex: A, B, C, etc.) pressionando a tecla 'S'.
3. Posicione sua mão na frente da câmera.
4. Pressione a tecla ESPAÇO para capturar uma amostra (ou segure para gravar em sequência).
5. Pressione 'ESC' para salvar os dados e fechar o aplicativo.
"""

import sys
import os

# Salvaguarda contra "import shadowing" (sombreamento de importação)
# Se houver uma pasta chamada 'mediapipe' no mesmo diretório de execução,
# o Python tentará importar essa pasta local (que possui modelos JS/WASM do site)
# ao invés da biblioteca real instalada via pip no seu ambiente virtual,
# gerando o erro "module 'mediapipe' has no attribute 'solutions'".
current_dir = os.path.abspath(os.path.dirname(__file__)) if '__file__' in locals() else os.getcwd()
sys_path_backup = list(sys.path)

try:
    # Filtra temporariamente o diretório do script para que o import procure nos pacotes globais/venv
    sys.path = [p for p in sys.path if p and os.path.abspath(p) != current_dir]
    import cv2
    print("\n[LibrasLens] Inicializando...")
    print("Carregando OpenCV e MediaPipe...")
    import mediapipe as mp
except (ImportError, AttributeError) as e:
    print("\n" + "!"*70)
    print(" DETECTADO CONFLITO OU CORRUPÇÃO DE PACOTES NO SEU SISTEMA ")
    print("!"*70)
    print(f"Detalhes do erro original:\n{e}")
    print("-"*70)
    print("Isso ocorre devido a uma incompatibilidade direta entre o MediaPipe, TensorFlow")
    print("e a biblioteca 'protobuf' instalados globalmente no seu Python.")
    print("\nA solução definitiva e mais segura é criar um Ambiente Virtual (venv)")
    print("isolado de outros pacotes conflitantes. Siga estes passos simples:")
    print("\n1. Desative o ambiente atual (se houver algum ativo):")
    print("   deactivate")
    print("\n2. Crie um novo ambiente virtual limpo chamado 'env_libras':")
    print("   python -m venv env_libras")
    print("\n3. Ative o novo ambiente criado:")
    print("   No Windows (PowerShell):  .\\env_libras\\Scripts\\Activate.ps1")
    print("   No Windows (CMD):         .\\env_libras\\Scripts\\activate.bat")
    print("   No Mac/Linux:             source env_libras/bin/activate")
    print("\n4. Instale apenas o OpenCV e o MediaPipe de forma limpa:")
    print("   pip install opencv-python mediapipe")
    print("\n5. Execute o script coletor com sucesso:")
    print("   python coletor_libras.py")
    print("!"*70 + "\n")
    sys.exit(1)
finally:
    # Restaura o sys.path original para manter o comportamento normal do Python
    sys.path = sys_path_backup

# Se as bibliotecas foram importadas mas o MediaPipe falhar por versão errada do protobuf
try:
    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.5
    )
    mp_drawing = mp.solutions.drawing_utils
    mp_drawing_styles = mp.solutions.drawing_styles
except AttributeError as e:
    print("\n" + "!"*70)
    print(" ERRO: O MEDIAPIPE NÃO CONSEGUIU INICIALIZAR CORRETAMENTE")
    print("!"*70)
    print(f"Detalhes: {e}")
    print("-"*70)
    print("O MediaPipe está instalado mas não consegue acessar os módulos internos")
    print("devido à versão do 'protobuf' instalada na sua máquina.")
    print("\nPara corrigir isso facilmente de forma definitiva, crie um ambiente limpo:")
    print("\n1. Crie um ambiente virtual limpo:")
    print("   python -m venv env_libras")
    print("\n2. Ative o ambiente:")
    print("   .\\env_libras\\Scripts\\Activate.ps1")
    print("\n3. Instale as bibliotecas necessárias:")
    print("   pip install opencv-python mediapipe")
    print("\n4. Execute novamente:")
    print("   python coletor_libras.py")
    print("!"*70 + "\n")
    sys.exit(1)

import csv
import os

# Nome do arquivo CSV onde os dados serão armazenados
NOME_ARQUIVO_CSV = "libras_dataset_completo.csv"

# Prepara os cabeçalhos do arquivo CSV: label, x0, y0, z0, x1, y1, z1, ... x20, y20, z20
headers = ["label"]
for i in range(21):
    headers.extend([f"x{i}", f"y{i}", f"z{i}"])

# Se o arquivo não existir, cria com os cabeçalhos
if not os.path.exists(NOME_ARQUIVO_CSV):
    with open(NOME_ARQUIVO_CSV, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)

def contar_amostras():
    """Conta quantas amostras de cada letra já existem no CSV."""
    contagem = {}
    if not os.path.exists(NOME_ARQUIVO_CSV):
        return contagem
    try:
        with open(NOME_ARQUIVO_CSV, mode="r", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader, None) # pula cabeçalho
            for row in reader:
                if row:
                    lbl = row[0].upper()
                    contagem[lbl] = contagem.get(lbl, 0) + 1
    except Exception as e:
        print(f"Erro ao ler contagem: {e}")
    return contagem

def main():
    # Inicializa a Webcam
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Erro: Não foi possível acessar a câmera/webcam.")
        sys.exit()

    letra_ativa = "A"
    amostras_salvas = contar_amostras()
    
    print("\n" + "="*50)
    print("      COLETOR DE MARCADORES DE LIBRAS PARA O LIBRASLENS")
    print("="*50)
    print("Comandos de Teclado:")
    print("  [ESPAÇO]  - Grava 1 amostra da Letra Ativa")
    print("  [S]       - Altera a Letra Ativa (digite no console)")
    print("  [C]       - Limpa a Letra Ativa atual do CSV local")
    print("  [ESC]     - Salva e fecha o aplicativo")
    print("="*50 + "\n")

    while cap.isOpened():
        success, image = cap.read()
        if not success:
            print("Ignorando quadro vazio da câmera.")
            continue

        # Inverte horizontalmente para efeito de espelho
        image = cv2.flip(image, 1)
        h_img, w_img, _ = image.shape

        # Converte a imagem BGR para RGB antes de processar com o MediaPipe
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = hands.process(image_rgb)

        # Variável para armazenar landmarks do quadro atual
        pontos_mao = None

        # Desenha as anotações das mãos na imagem
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(
                    image,
                    hand_landmarks,
                    mp_hands.HAND_CONNECTIONS,
                    mp_drawing_styles.get_default_hand_landmarks_style(),
                    mp_drawing_styles.get_default_hand_connections_style()
                )
                pontos_mao = hand_landmarks.landmark

        # Barra de Status na parte superior
        cv2.rectangle(image, (0, 0), (w_img, 65), (20, 24, 33), -1)
        
        qtd_atual = amostras_salvas.get(letra_ativa, 0)
        cv2.putText(
            image, 
            f"LETRA ATIVA: '{letra_ativa}'  |  Amostras Gravadas: {qtd_atual}", 
            (20, 40), 
            cv2.FONT_HERSHEY_SIMPLEX, 
            0.7, 
            (16, 185, 129), # Verde esmeralda
            2, 
            cv2.LINE_AA
        )

        cv2.putText(
            image, 
            "[Espaco] Gravar  |  [S] Mudar Letra  |  [ESC] Sair", 
            (20, h_img - 20), 
            cv2.FONT_HERSHEY_SIMPLEX, 
            0.5, 
            (200, 200, 200), 
            1, 
            cv2.LINE_AA
        )

        # Se houver mão detectada, mostra indicador visual de que está pronto para gravar
        if pontos_mao:
            cv2.circle(image, (w_img - 30, 35), 10, (16, 185, 129), -1)
        else:
            cv2.circle(image, (w_img - 30, 35), 10, (59, 59, 239), -1)

        cv2.imshow('Coletor de Sinais LIBRAS', image)
        
        key = cv2.waitKey(1) & 0xFF
        
        # ESC para sair
        if key == 27:
            print("\nProcesso finalizado pelo usuário.")
            break
            
        # ESPAÇO para gravar a amostra
        elif key == 32:
            if pontos_mao:
                # Extrai as coordenadas (x, y, z) de todos os 21 landmarks
                linha_dados = [letra_ativa]
                for lm in pontos_mao:
                    linha_dados.extend([lm.x, lm.y, lm.z])
                
                # Salva no arquivo CSV
                with open(NOME_ARQUIVO_CSV, mode="a", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow(linha_dados)
                
                # Atualiza contadores
                amostras_salvas[letra_ativa] = amostras_salvas.get(letra_ativa, 0) + 1
                print(f"Amostra registrada para a letra '{letra_ativa}'! Total: {amostras_salvas[letra_ativa]}")
            else:
                print("Aviso: Nenhuma mao detectada no video para gravacao.")
                
        # S para mudar a Letra Ativa
        elif key == ord('s') or key == ord('S'):
            print("\n" + "-"*30)
            nova_letra = input("Digite a nova Letra Ativa (ex: A, B, C...): ").strip().upper()
            if nova_letra:
                letra_ativa = nova_letra[:3] # limite de 3 caracteres
                print(f"Letra ativa alterada para: '{letra_ativa}'")
            print("-"*30 + "\n")
            
        # C para limpar amostras locais da letra ativa
        elif key == ord('c') or key == ord('C'):
            confirmar = input(f"Tem certeza que deseja apagar todas as amostras salvas de '{letra_ativa}' do CSV local? (s/n): ").strip().lower()
            if confirmar == 's':
                linhas_manter = []
                if os.path.exists(NOME_ARQUIVO_CSV):
                    with open(NOME_ARQUIVO_CSV, mode="r", encoding="utf-8") as f:
                        reader = csv.reader(f)
                        linhas_manter.append(next(reader)) # Mantém o cabeçalho
                        for r in reader:
                            if r and r[0].upper() != letra_ativa:
                                linhas_manter.append(r)
                    with open(NOME_ARQUIVO_CSV, mode="w", newline="", encoding="utf-8") as f:
                        writer = csv.writer(f)
                        writer.writerows(linhas_manter)
                    amostras_salvas[letra_ativa] = 0
                    print(f"Amostras locais da letra '{letra_ativa}' foram reiniciadas!")

    cap.release()
    cv2.destroyAllWindows()
    
    print("\n" + "="*50)
    print(f"Dataset salvo com sucesso em: {os.path.abspath(NOME_ARQUIVO_CSV)}")
    print("Agora você pode importar esse arquivo diretamente no LibrasLens!")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()
