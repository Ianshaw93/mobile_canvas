import React from 'react'
import { create } from 'zustand'

type Dimensions = {
    width: number
    height: number
}

type Point = { 
    x: number
    y: number
}

type Image = {
    url: string
    pointIndex: number
}

type Plan = {
    id: string
    // name: string
    url: string
    points: Array<Point>
    images: Array<Image>

}

type State = {
    plans: Array<React.ReactNode>
    canvasDimensions: Dimensions | {}
    addPlan: (plan: React.ReactNode) => void
    setCanvasDimensions: (dimensions: Dimensions) => void
}
const useSiteStore = create((set) => {
    return {
        plans: [],
        canvasDimensions: {},
        // 
        addPlan: (plan: Plan) => set((state: State) => ({ plans: [...state.plans, plan] })),
        // add image to point on plan
        // find current plan
        // find current point index
        // find add image with current point index
        addImage: (image: Image, plan: Plan, point: Point) => set((state: State) => ({ plans: [...state.plans, image] })),
        setCanvasDimensions: (dimensions: Dimensions) => set(() => ({
            canvasDimensions: dimensions
        })),
        
    }
})

export default useSiteStore