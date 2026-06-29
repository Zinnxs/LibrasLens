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

# 1. Identificar o diretório do script e normalizá-lo para evitar shadowing de pacotes reais
current_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in locals() else os.getcwd()
current_dir_norm = os.path.normpath(current_dir).lower()

# 2. Corrigir o sys.path imediatamente para evitar que pastas locais sombreiem pacotes reais instalados via pip
sys_path_backup = list(sys.path)
sys_path_filtered = []
for p in sys.path:
    if not p:
        continue
    p_norm = os.path.normpath(os.path.abspath(p)).lower()
    # Remove o diretório atual e subpastas de cache/projetos locais
    if p_norm == current_dir_norm:
        continue
    if p_norm == os.path.normpath(os.getcwd()).lower():
        continue
    sys_path_filtered.append(p)

sys.path = sys_path_filtered

# 3. Detectar e remover qualquer import "sombreado" (Shadowed Import) pré-existente
if 'mediapipe' in sys.modules:
    mp_temp = sys.modules['mediapipe']
    is_shadowed = False
    if not hasattr(mp_temp, '__file__') or mp_temp.__file__ is None:
        is_shadowed = True
    elif mp_temp.__file__:
        file_abs = os.path.abspath(mp_temp.__file__)
        file_norm = os.path.normpath(file_abs).lower()
        parent_dir = os.path.dirname(file_abs)
        grandparent_dir = os.path.dirname(parent_dir)
        if os.path.normpath(grandparent_dir).lower() == current_dir_norm:
            if "site-packages" not in file_norm and "lib" not in file_norm:
                is_shadowed = True
    if is_shadowed:
        # Remove a referência corrompida/sombreada para forçar re-importação limpa do venv
        for key in list(sys.modules.keys()):
            if key == 'mediapipe' or key.startswith('mediapipe.'):
                del sys.modules[key]

# 4. Agora tentar importar o OpenCV e o MediaPipe de forma limpa
try:
    import cv2
    print("\n[LibrasLens] Inicializando...")
    print("Carregando OpenCV e MediaPipe...")
    import mediapipe as mp
except (ImportError, AttributeError) as e:
    # Restaura o sys.path antes de exibir o erro
    sys.path = sys_path_backup
    
    # Coleta informações de diagnóstico importantes
    local_mp_exists = os.path.isdir(os.path.join(current_dir, "mediapipe")) or os.path.isdir("mediapipe")
    protobuf_version = "Não instalado ou inacessível"
    try:
        import google.protobuf
        protobuf_version = getattr(google.protobuf, "__version__", "Instalado (versão desconhecida)")
    except ImportError:
        pass

    print("\n" + "!"*70)
    print(" DETECTADO CONFLITO OU CORRUPÇÃO DE PACOTES NO SEU SISTEMA ")
    print("!"*70)
    print(f"Detalhes do erro original:\n{e}")
    print("-"*70)
    print(f"Executável Python em uso: {sys.executable}")
    print(f"Versão do protobuf detectada: {protobuf_version}")
    
    if local_mp_exists:
        print("\n[AVISO CRÍTICO DE CONFLITO LOCAL]")
        print("Existe uma pasta chamada 'mediapipe' no seu diretório atual.")
        print("O Python está confundindo essa pasta local com a biblioteca instalada!")
        print("-> SOLUÇÃO: Renomeie ou remova qualquer pasta chamada 'mediapipe' nesta pasta atual.")
    
    print("\n>>> Siga um dos métodos abaixo para resolver:")
    print("\nMÉTODO 1: CORRIGIR O SEU AMBIENTE ATUAL (Mais rápido)")
    print("Execute este comando no seu terminal:")
    print("   pip install \"protobuf>=4.21.0,<5.0.0\" --force-reinstall")
    print("\nMÉTODO 2: CRIAR UM AMBIENTE VIRTUAL ISOLADO (Recomendado)")
    print("1. Desative o ambiente atual (se houver algum ativo):")
    print("   deactivate")
    print("\n2. Crie um novo ambiente virtual limpo chamado 'env_libras':")
    print("   python -m venv env_libras")
    print("\n3. Ative o novo ambiente criado:")
    print("   No Windows (PowerShell):  .\\env_libras\\Scripts\\Activate.ps1")
    print("   No Windows (CMD):         .\\env_libras\\Scripts\\activate.bat")
    print("   No Mac/Linux:             source env_libras/bin/activate")
    print("\n4. Instale as bibliotecas de forma limpa com a versão certa de protobuf:")
    print("   pip install opencv-python mediapipe \"protobuf>=4.21.0,<5.0.0\"")
    print("\n5. Execute o script coletor com sucesso:")
    print("   python coletor_libras.py")
    print("!"*70 + "\n")
    sys.exit(1)

# Se as bibliotecas foram importadas mas o MediaPipe falhar por versão errada do protobuf ou outro detalhe
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
    # Coleta informações de diagnóstico importantes
    local_mp_exists = os.path.isdir(os.path.join(current_dir, "mediapipe")) or os.path.isdir("mediapipe")
    mp_file = getattr(mp, '__file__', 'Não definido')
    mp_path = getattr(mp, '__path__', 'Não definido')
    protobuf_version = "Não instalado ou inacessível"
    try:
        import google.protobuf
        protobuf_version = getattr(google.protobuf, "__version__", "Instalado (versão desconhecida)")
    except ImportError:
        pass

    print("\n" + "!"*70)
    print(" ERRO: O MEDIAPIPE NÃO CONSEGUIU INICIALIZAR CORRETAMENTE")
    print("!"*70)
    print(f"Detalhes: {e}")
    print("-"*70)
    print(f"Executável Python em uso: {sys.executable}")
    print(f"Local de carregamento do MediaPipe: {mp_file or mp_path}")
    print(f"Versão do protobuf instalada: {protobuf_version}")
    
    if local_mp_exists or "site-packages" not in str(mp_file).lower():
        print("\n[AVISO CRÍTICO DE CONFLITO LOCAL]")
        print("Existe uma pasta ou arquivo 'mediapipe' no seu diretório de trabalho atual.")
        print("O Python está carregando essa pasta local (que é apenas para o site do navegador)")
        print("ao invés de carregar o pacote real que você instalou via pip!")
        print("-> SOLUÇÃO: Renomeie a pasta 'mediapipe' atual (por exemplo, para 'mediapipe_assets')")
        print("   e tente rodar o script novamente.")
    else:
        print("\nNo Windows, a versão de 'protobuf' padrão instalada (v5+) é incompatível")
        print("com as dependências do MediaPipe.")
    
    print("\n>>> Siga um dos métodos abaixo para resolver:")
    print("\nMÉTODO 1: CORRIGIR O SEU AMBIENTE ATUAL (Recomendado)")
    print("Execute este comando no seu terminal/PowerShell para instalar a versão correta:")
    print("   pip install \"protobuf>=4.21.0,<5.0.0\" --force-reinstall")
    print("\nMÉTODO 2: REINSTALAR O MEDIAPIPE DE FORMA LIMPA")
    print("Se o comando acima não resolver, execute:")
    print("   pip install --force-reinstall mediapipe \"protobuf>=4.21.0,<5.0.0\"")
    print("\nMÉTODO 3: CRIAR UM AMBIENTE VIRTUAL DO ZERO")
    print("1. Crie um ambiente virtual limpo:")
    print("   python -m venv env_libras")
    print("2. Ative o ambiente:")
    print("   .\\env_libras\\Scripts\\Activate.ps1")
    print("3. Instale as bibliotecas com a restrição de protobuf:")
    print("   pip install opencv-python mediapipe \"protobuf>=4.21.0,<5.0.0\"")
    print("4. Execute novamente:")
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
