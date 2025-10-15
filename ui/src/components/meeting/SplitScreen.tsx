import styled from "styled-components"

interface request {
    children?: [React.ReactNode, React.ReactNode],
    leftWidth?: number,
    rightWidth?: number
}

const Container = styled.div`
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
    `

const Pane = styled.div<{ width: number }>`
    flex: ${(props) => props.width};
    height: 100%;
    `

const SplitScreen = ({ children, leftWidth, rightWidth }: request) => {
    const [left, right] = children || [];
    return (
        <Container>
            <Pane width={leftWidth || 1}>
                {left}
            </Pane>
            <Pane width={rightWidth || 1}>
                {right}
            </Pane>
        </Container>
    )
}

export default SplitScreen